"""
BigQuery API Service for Projects & Jobs
Separate FastAPI backend for handling BigQuery operations
"""

from fastapi import FastAPI, HTTPException, Query, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import traceback
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timedelta
import hashlib
import re
import json
import os
import logging
from pydantic import BaseModel
from config import Config
from logging_config import setup_logging, log_error_with_context, create_module_logger
from information_schema_scanner import (
    check_information_schema_access,
    validate_project_access,
    scan_project_with_information_schema,
    store_templates_in_bigquery
)
from table_analysis import analyze_tables, store_table_analysis

# Setup comprehensive logging
setup_logging(
    log_level=os.getenv('LOG_LEVEL', 'INFO'),
    log_format='simple' if os.getenv('APP_ENV') == 'development' else 'detailed'
)

# Initialize module logger
logger = create_module_logger('main')

# Initialize FastAPI app
app = FastAPI(
    title="BigQuery Optimizer API",
    description="API for managing BigQuery optimization projects and templates",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.CORS_ORIGINS.split(','),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler for better error visibility
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions with detailed logging"""
    
    # Log full error details
    error_id = hashlib.md5(f"{datetime.utcnow().isoformat()}{str(exc)}".encode()).hexdigest()[:8]
    
    log_error_with_context(
        logger,
        exc,
        context={
            'error_id': error_id,
            'path': request.url.path,
            'method': request.method,
            'query_params': dict(request.query_params),
            'headers': {k: v for k, v in request.headers.items() if 'authorization' not in k.lower()},
        }
    )
    
    # Prepare error response based on environment
    if Config.APP_ENV == 'development':
        # In development, return full error details
        error_detail = {
            'error_id': error_id,
            'error': str(exc),
            'type': type(exc).__name__,
            'traceback': traceback.format_exc().split('\n'),
            'path': request.url.path,
            'timestamp': datetime.utcnow().isoformat()
        }
    else:
        # In production, return limited error info
        error_detail = {
            'error_id': error_id,
            'error': 'An internal server error occurred',
            'timestamp': datetime.utcnow().isoformat()
        }
    
    return JSONResponse(
        status_code=500,
        content=error_detail
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with logging"""
    
    # Log HTTP exceptions at appropriate level
    if exc.status_code >= 500:
        logger.error(f"HTTP {exc.status_code} at {request.url.path}: {exc.detail}")
    elif exc.status_code >= 400:
        logger.warning(f"HTTP {exc.status_code} at {request.url.path}: {exc.detail}")
    else:
        logger.info(f"HTTP {exc.status_code} at {request.url.path}: {exc.detail}")
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            'detail': exc.detail,
            'status_code': exc.status_code,
            'timestamp': datetime.utcnow().isoformat()
        }
    )

# Initialize BigQuery client
# You can use service account or default credentials
try:
    # Try to use service account if available
    if os.path.exists('service-account.json'):
        credentials = service_account.Credentials.from_service_account_file(
            'service-account.json',
            scopes=['https://www.googleapis.com/auth/bigquery']
        )
        client = bigquery.Client(credentials=credentials)
    else:
        # Use default credentials (when running on GCP)
        client = bigquery.Client()
    
    # Use centralized configuration
    BQ_PROJECT = Config.BQ_PROJECT_ID
    BQ_DATASET = Config.BQ_DATASET
    logger.info(f"BigQuery client initialized for project: {BQ_PROJECT}")
    
except Exception as e:
    logger.error(f"Failed to initialize BigQuery client: {e}", exc_info=True)
    client = None

# Pydantic models
class ProjectConfig(BaseModel):
    project_id: str
    display_name: Optional[str] = None
    analysis_window: int = 30
    regions: List[str] = []
    datasets: List[str] = []
    pricing_mode: str = "on-demand"
    price_per_tb: float = 5.00
    auto_detect_regions: bool = True
    auto_detect_datasets: bool = True

class AnalysisRequest(BaseModel):
    template_ids: List[str]
    analysis_type: str = "rules_rewrite_validate"

class Analysis(BaseModel):
    query: str
    project_id: str
    template_id: Optional[str] = None
    analysis_type: str = "manual"
    created_by: Optional[str] = "user@example.com"
    result: Optional[Dict[str, Any]] = None  # Full analysis result from ADK
    timestamp: Optional[str] = None

class AnalysisUpdate(BaseModel):
    review_status: Optional[str] = None
    review_notes: Optional[str] = None
    applied_to_production: Optional[bool] = None

# Helper functions
def normalize_sql_pattern(sql: str) -> str:
    """Normalize SQL to create a pattern by replacing literals"""
    if not sql:
        return ""
    
    # Remove comments
    normalized = re.sub(r'--.*$', '', sql, flags=re.MULTILINE)
    normalized = re.sub(r'/\*[\s\S]*?\*/', '', normalized)
    
    # Normalize whitespace
    normalized = ' '.join(normalized.split())
    
    # Replace string literals
    normalized = re.sub(r"'[^']*'", '?', normalized)
    normalized = re.sub(r'"[^"]*"', '?', normalized)
    
    # Replace numbers
    normalized = re.sub(r'\b\d+\.?\d*\b', '?', normalized)
    
    # Replace date/timestamp literals
    normalized = re.sub(r'DATE\s*\([^)]+\)', 'DATE(?)', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'TIMESTAMP\s*\([^)]+\)', 'TIMESTAMP(?)', normalized, flags=re.IGNORECASE)
    
    return normalized.upper().strip()

def hash_pattern(pattern: str) -> str:
    """Generate hash for SQL pattern"""
    return hashlib.md5(pattern.encode()).hexdigest()

def extract_tables_from_query(query_text: str, referenced_tables: str) -> List[str]:
    """Extract table names from query"""
    tables = []
    
    # Try to parse referenced_tables JSON
    if referenced_tables:
        try:
            refs = json.loads(referenced_tables)
            for ref in refs:
                if 'project_id' in ref and 'dataset_id' in ref and 'table_id' in ref:
                    tables.append(f"{ref['dataset_id']}.{ref['table_id']}")
                elif 'dataset_id' in ref and 'table_id' in ref:
                    tables.append(f"{ref['dataset_id']}.{ref['table_id']}")
        except:
            pass
    
    # Fallback to regex extraction if no referenced_tables
    if not tables and query_text:
        # Simple regex to find table references
        pattern = r'FROM\s+`?([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)`?'
        matches = re.findall(pattern, query_text, re.IGNORECASE)
        for match in matches:
            tables.append(f"{match[1]}.{match[2]}")
    
    return list(set(tables))  # Remove duplicates

# API Endpoints

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "bigquery_connected": client is not None,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics from BigQuery"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Get overall statistics
        stats_query = f"""
        SELECT 
            COUNT(DISTINCT p.project_id) as total_projects,
            COUNT(DISTINCT t.template_id) as total_templates,
            SUM(t.total_runs) as total_query_runs,
            SUM(t.total_bytes_processed) / POW(10, 12) as total_tb_processed,
            AVG(t.avg_runtime_seconds) as avg_runtime_seconds,
            SUM(t.total_bytes_processed) / POW(10, 12) * 5.00 as total_cost_estimate
        FROM `{BQ_PROJECT}.{BQ_DATASET}.projects` p
        LEFT JOIN `{BQ_PROJECT}.{BQ_DATASET}.query_templates` t
            ON p.project_id = t.project_id
        WHERE p.is_active = true
        """
        
        stats_job = client.query(stats_query)
        stats_result = list(stats_job)[0] if stats_job else None
        
        # Get recent templates
        recent_query = f"""
        SELECT 
            t.template_id,
            t.project_id,
            t.sql_pattern,
            t.total_runs,
            t.total_bytes_processed / POW(10, 9) as gb_processed,
            t.avg_runtime_seconds,
            t.last_seen,
            t.state
        FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates` t
        ORDER BY t.last_seen DESC
        LIMIT 10
        """
        
        recent_job = client.query(recent_query)
        recent_templates = []
        for row in recent_job:
            recent_templates.append({
                "template_id": row.template_id,
                "project_id": row.project_id,
                "sql_snippet": row.sql_pattern[:100] if row.sql_pattern else "",
                "total_runs": row.total_runs,
                "gb_processed": float(row.gb_processed or 0),
                "avg_runtime": float(row.avg_runtime_seconds or 0),
                "last_seen": row.last_seen.isoformat() if row.last_seen else None,
                "state": row.state
            })
        
        # Get top cost drivers
        cost_query = f"""
        SELECT 
            t.template_id,
            t.sql_pattern,
            t.total_runs,
            t.total_bytes_processed / POW(10, 12) as tb_processed,
            (t.total_bytes_processed / POW(10, 12)) * 5.00 as estimated_cost
        FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates` t
        ORDER BY t.total_bytes_processed DESC
        LIMIT 5
        """
        
        cost_job = client.query(cost_query)
        top_cost_drivers = []
        for row in cost_job:
            top_cost_drivers.append({
                "template_id": row.template_id,
                "sql_snippet": row.sql_pattern[:100] if row.sql_pattern else "",
                "total_runs": row.total_runs,
                "tb_processed": float(row.tb_processed or 0),
                "estimated_cost": float(row.estimated_cost or 0)
            })
        
        return {
            "stats": {
                "total_projects": int(stats_result.total_projects or 0) if stats_result else 0,
                "total_templates": int(stats_result.total_templates or 0) if stats_result else 0,
                "total_query_runs": int(stats_result.total_query_runs or 0) if stats_result else 0,
                "total_tb_processed": float(stats_result.total_tb_processed or 0) if stats_result else 0,
                "avg_runtime_seconds": float(stats_result.avg_runtime_seconds or 0) if stats_result else 0,
                "total_cost_estimate": float(stats_result.total_cost_estimate or 0) if stats_result else 0
            },
            "recent_templates": recent_templates,
            "top_cost_drivers": top_cost_drivers,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/check-permissions")
async def check_permissions(request: Dict[str, Any]):
    """Check permissions for INFORMATION_SCHEMA access"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        permission_type = request.get("permission_type")
        
        if permission_type == "INFORMATION_SCHEMA.JOBS":
            try:
                query = f"""
                SELECT COUNT(*) as count
                FROM `{project_id}.region-us.INFORMATION_SCHEMA.JOBS`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
                LIMIT 1
                """
                client.query(query).result()
                return {"success": True, "has_access": True}
            except:
                return {"success": True, "has_access": False}
                
        elif permission_type == "INFORMATION_SCHEMA.JOBS_BY_PROJECT":
            try:
                query = f"""
                SELECT COUNT(*) as count
                FROM `{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
                LIMIT 1
                """
                client.query(query).result()
                return {"success": True, "has_access": True}
            except:
                return {"success": True, "has_access": False}
                
        elif permission_type == "bigquery.tables.getData":
            try:
                query = f"""
                SELECT table_name
                FROM `{project_id}.region-us.INFORMATION_SCHEMA.TABLES`
                LIMIT 1
                """
                client.query(query).result()
                return {"success": True, "has_access": True}
            except:
                return {"success": True, "has_access": False}
                
        elif permission_type == "bigquery.jobs.create":
            try:
                test_query = "SELECT 1"
                job_config = bigquery.QueryJobConfig(dry_run=True)
                client.query(test_query, job_config=job_config).result()
                return {"success": True, "has_access": True}
            except:
                return {"success": True, "has_access": False}
        else:
            # Check all permissions
            permissions = check_information_schema_access(client, project_id)
            return {"success": True, "permissions": permissions}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/validate-access")
async def validate_access(request: Dict[str, Any]):
    """Validate project access and return basic stats"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("projectId")
        analysis_window = request.get("analysisWindow")
        custom_tables = request.get("customTables", None)
        
        result = validate_project_access(client, project_id, analysis_window, custom_tables)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/scan-information-schema")
async def scan_information_schema(request: Dict[str, Any]):
    """Scan project using INFORMATION_SCHEMA and store results"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        analysis_window = request.get("analysis_window", 30)
        price_per_tb = request.get("price_per_tb", 5.0)
        custom_tables = request.get("custom_tables", None)
        
        # Scan using INFORMATION_SCHEMA for query templates
        scan_result = scan_project_with_information_schema(
            client, project_id, analysis_window, price_per_tb, custom_tables
        )
        
        if scan_result["success"] and scan_result["templates"]:
            # Store templates in BigQuery
            store_success = store_templates_in_bigquery(
                client,
                project_id,
                scan_result["templates"],
                {
                    "analysis_window": analysis_window,
                    "price_per_tb": price_per_tb,
                    "scan_date": datetime.utcnow().isoformat()
                }
            )
            
            scan_result["templates_stored"] = store_success
        
        # Also run table analysis if custom tables are provided
        if custom_tables:
            try:
                from table_analysis import analyze_tables, store_table_analysis
                table_result = analyze_tables(client, project_id, custom_tables, analysis_window)
                
                if table_result["success"] and table_result["tables"]:
                    # Store table analysis results
                    store_table_analysis(client, project_id, table_result["tables"])
                    scan_result["table_analysis"] = {
                        "success": True,
                        "tables_analyzed": len(table_result["tables"]),
                        "summary": table_result.get("summary")
                    }
            except Exception as e:
                print(f"Table analysis failed: {e}")
                scan_result["table_analysis"] = {
                    "success": False,
                    "error": str(e)
                }
        
        return scan_result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/scan")
async def scan_project(project_id: str, analysis_window: int = 30):
    """Scan a BigQuery project for queries and create templates"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Query INFORMATION_SCHEMA for recent jobs
        query = f"""
        SELECT 
            job_id,
            query,
            user_email,
            creation_time,
            start_time,
            end_time,
            total_bytes_processed,
            total_bytes_billed,
            total_slot_ms,
            TIMESTAMP_DIFF(end_time, start_time, SECOND) as runtime_seconds,
            error_result,
            statement_type,
            referenced_tables,
            labels
        FROM `{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
        WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {analysis_window} DAY)
            AND statement_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE')
            AND error_result IS NULL
            AND query IS NOT NULL
            AND total_bytes_processed > 0
        ORDER BY creation_time DESC
        LIMIT 10000
        """
        
        query_job = client.query(query)
        results = list(query_job)
        
        # Group queries into templates
        templates = {}
        for row in results:
            # Create normalized pattern
            pattern = normalize_sql_pattern(row.query)
            pattern_hash = hash_pattern(pattern)
            
            if pattern_hash not in templates:
                templates[pattern_hash] = {
                    "template_id": f"tmpl_{pattern_hash[:8]}",
                    "template_hash": pattern_hash,
                    "sql_pattern": pattern[:500],  # First 500 chars
                    "full_sql": row.query,
                    "tables_used": extract_tables_from_query(row.query, row.referenced_tables),
                    "runs": [],
                    "total_runs": 0,
                    "total_bytes_processed": 0,
                    "first_seen": row.creation_time,
                    "last_seen": row.creation_time,
                }
            
            template = templates[pattern_hash]
            template["runs"].append({
                "job_id": row.job_id,
                "start_time": row.start_time.isoformat() if row.start_time else None,
                "bytes_processed": row.total_bytes_processed or 0,
                "runtime_seconds": row.runtime_seconds or 0,
                "user_email": row.user_email,
            })
            
            template["total_runs"] += 1
            template["total_bytes_processed"] += row.total_bytes_processed or 0
            
            if row.creation_time > template["last_seen"]:
                template["last_seen"] = row.creation_time
            if row.creation_time < template["first_seen"]:
                template["first_seen"] = row.creation_time
        
        # Calculate statistics for each template
        template_list = []
        for pattern_hash, template in templates.items():
            bytes_values = sorted([r["bytes_processed"] for r in template["runs"]])
            runtime_values = sorted([r["runtime_seconds"] for r in template["runs"]])
            
            if bytes_values:
                template["p50_bytes_processed"] = bytes_values[len(bytes_values) // 2]
                template["p90_bytes_processed"] = bytes_values[int(len(bytes_values) * 0.9)]
                template["p99_bytes_processed"] = bytes_values[int(len(bytes_values) * 0.99)]
            
            if runtime_values:
                template["p50_runtime_seconds"] = runtime_values[len(runtime_values) // 2]
                template["p90_runtime_seconds"] = runtime_values[int(len(runtime_values) * 0.9)]
                template["avg_runtime_seconds"] = sum(runtime_values) / len(runtime_values)
            
            template["runs_per_day"] = template["total_runs"] / analysis_window
            
            # Convert datetime to isoformat for JSON serialization
            template["first_seen"] = template["first_seen"].isoformat() if template["first_seen"] else None
            template["last_seen"] = template["last_seen"].isoformat() if template["last_seen"] else None
            
            # Remove individual runs from response (keep in DB only)
            del template["runs"]
            template_list.append(template)
        
        return {
            "success": True,
            "project_id": project_id,
            "templates_discovered": len(template_list),
            "total_queries_analyzed": len(results),
            "templates": template_list
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects")
async def create_project(config: ProjectConfig):
    """Create a new project in bq_optimizer dataset"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Check if project already exists
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{BQ_PROJECT}.{BQ_DATASET}.projects`
        WHERE project_id = '{config.project_id}'
        """
        check_job = client.query(check_query)
        check_result = list(check_job)[0]
        
        if check_result.count > 0:
            # Project exists, update it instead
            update_query = f"""
            UPDATE `{BQ_PROJECT}.{BQ_DATASET}.projects`
            SET display_name = '{config.display_name or config.project_id}',
                analysis_window = {config.analysis_window},
                regions = {config.regions},
                datasets = {config.datasets},
                pricing_mode = '{config.pricing_mode}',
                price_per_tb = {config.price_per_tb},
                auto_detect_regions = {config.auto_detect_regions},
                auto_detect_datasets = {config.auto_detect_datasets},
                updated_at = CURRENT_TIMESTAMP()
            WHERE project_id = '{config.project_id}'
            """
            client.query(update_query).result()
            
            # Scan the project
            scan_result = await scan_project(config.project_id, config.analysis_window)
            
            # Run table analysis for the updated project
            try:
                print(f"Running table analysis for project {config.project_id}...")
                table_analysis_result = analyze_tables(client, config.project_id)
                print(f"Table analysis completed: {table_analysis_result.get('summary', {})}")
            except Exception as table_error:
                print(f"Warning: Failed to run table analysis: {table_error}")
                table_analysis_result = None
            
            return {
                "success": True,
                "message": "Project updated",
                "project": config.dict(),
                "scan_result": scan_result,
                "table_analysis": table_analysis_result
            }
        
        # First, scan the project to get initial data
        scan_result = await scan_project(config.project_id, config.analysis_window)
        
        # Insert project into bq_optimizer.projects table
        table_id = f"{BQ_PROJECT}.{BQ_DATASET}.projects"
        table = client.get_table(table_id)
        
        rows_to_insert = [{
            "project_id": config.project_id,
            "display_name": config.display_name or config.project_id,
            "analysis_window": config.analysis_window,
            "regions": config.regions,
            "datasets": config.datasets,
            "pricing_mode": config.pricing_mode,
            "price_per_tb": config.price_per_tb,
            "auto_detect_regions": config.auto_detect_regions,
            "auto_detect_datasets": config.auto_detect_datasets,
            "is_active": True,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "last_scan_at": datetime.utcnow().isoformat()
        }]
        
        errors = client.insert_rows_json(table, rows_to_insert)
        if errors:
            raise Exception(f"Failed to insert project: {errors}")
        
        # Insert templates into bq_optimizer.query_templates
        if scan_result["templates"]:
            template_table_id = f"{BQ_PROJECT}.{BQ_DATASET}.query_templates"
            template_table = client.get_table(template_table_id)
            
            template_rows = []
            for template in scan_result["templates"]:
                template_rows.append({
                    "template_id": template["template_id"],
                    "project_id": config.project_id,
                    "template_hash": template["template_hash"],
                    "sql_pattern": template["sql_pattern"],
                    "full_sql": template["full_sql"],
                    "tables_used": template["tables_used"],
                    "first_seen": template["first_seen"] if isinstance(template["first_seen"], str) else template["first_seen"].isoformat() if template["first_seen"] else None,
                    "last_seen": template["last_seen"] if isinstance(template["last_seen"], str) else template["last_seen"].isoformat() if template["last_seen"] else None,
                    "total_runs": template["total_runs"],
                    "total_bytes_processed": template["total_bytes_processed"],
                    "p50_bytes_processed": template.get("p50_bytes_processed", 0),
                    "p90_bytes_processed": template.get("p90_bytes_processed", 0),
                    "p99_bytes_processed": template.get("p99_bytes_processed", 0),
                    "avg_runtime_seconds": round(template.get("avg_runtime_seconds", 0), 2),
                    "p50_runtime_seconds": round(template.get("p50_runtime_seconds", 0), 2),
                    "p90_runtime_seconds": round(template.get("p90_runtime_seconds", 0), 2),
                    "state": "new",
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat()
                })
            
            errors = client.insert_rows_json(template_table, template_rows)
            if errors:
                print(f"Warning: Failed to insert some templates: {errors}")
        
        # Run table analysis for the new project
        try:
            print(f"Running table analysis for project {config.project_id}...")
            table_analysis_result = analyze_tables(client, config.project_id)
            print(f"Table analysis completed: {table_analysis_result.get('summary', {})}")
        except Exception as table_error:
            print(f"Warning: Failed to run table analysis: {table_error}")
            table_analysis_result = None
        
        return {
            "success": True,
            "project": config.dict(),
            "scan_result": scan_result,
            "table_analysis": table_analysis_result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/templates/save-analysis")
async def save_template_analysis(request: Dict[str, Any]):
    """Save template analysis results to BigQuery"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        template_id = request.get("template_id")
        analysis_result = request.get("result")
        
        if not all([project_id, template_id, analysis_result]):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # Update the template with analysis results
        update_query = f"""
        UPDATE `{BQ_PROJECT}.{BQ_DATASET}.query_templates`
        SET 
            state = 'analyzed',
            analysis_result = TO_JSON_STRING(@analysis_result),
            compliance_score = @compliance_score,
            optimization_score = @optimization_score,
            estimated_savings_usd = @estimated_savings,
            updated_at = CURRENT_TIMESTAMP()
        WHERE template_id = @template_id AND project_id = @project_id
        """
        
        # Extract key metrics from analysis result
        compliance_score = analysis_result.get("metadata", {}).get("optimizationScore", 0)
        optimization_score = analysis_result.get("metadata", {}).get("optimizationScore", 0)
        
        # Calculate estimated savings
        original_cost = 0
        optimized_cost = 0
        if analysis_result.get("validationResult"):
            original_cost = float(analysis_result["validationResult"].get("originalCost", 0))
            optimized_cost = float(analysis_result["validationResult"].get("optimizedCost", 0))
        elif analysis_result.get("metadata", {}).get("stages", {}).get("optimization"):
            optimization = analysis_result["metadata"]["stages"]["optimization"]
            original_cost = optimization.get("original_validation", {}).get("estimated_cost_usd", 0)
            optimized_cost = optimization.get("final_validation", {}).get("estimated_cost_usd", 0)
        
        estimated_savings = original_cost - optimized_cost
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("template_id", "STRING", template_id),
                bigquery.ScalarQueryParameter("project_id", "STRING", project_id),
                bigquery.ScalarQueryParameter("analysis_result", "JSON", json.dumps(analysis_result)),
                bigquery.ScalarQueryParameter("compliance_score", "FLOAT64", compliance_score),
                bigquery.ScalarQueryParameter("optimization_score", "FLOAT64", optimization_score),
                bigquery.ScalarQueryParameter("estimated_savings", "FLOAT64", estimated_savings),
            ]
        )
        
        query_job = client.query(update_query, job_config=job_config)
        query_job.result()
        
        return {
            "success": True,
            "message": "Analysis saved successfully",
            "template_id": template_id,
            "compliance_score": compliance_score
        }
        
    except Exception as e:
        print(f"Error saving template analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/templates/{project_id}")
async def get_templates(
    project_id: str,
    limit: int = Query(50, description="Number of templates to return"),
    offset: int = Query(0, description="Offset for pagination"),
    sort_by: str = Query("total_bytes_processed", description="Field to sort by (total_bytes_processed, total_runs, avg_runtime_seconds)"),
    order: str = Query("desc", description="Sort order (asc or desc)"),
    priority_filter: Optional[str] = Query(None, description="Filter by priority level (CRITICAL, HIGH, MEDIUM, LOW)")
):
    """Get query templates for a project with pagination"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Build the ORDER BY clause - map friendly names to actual columns
        sort_column = sort_by
        if sort_by == "total_cost_usd" or sort_by == "cost":
            sort_column = "total_bytes_processed"
        elif sort_by == "execution_count":
            sort_column = "total_runs"
        order_direction = "DESC" if order == "desc" else "ASC"
        order_clause = f"ORDER BY {sort_column} {order_direction}"
        
        # Build the WHERE clause
        where_clauses = [f"project_id = '{project_id}'"]
        # Remove priority filter since we don't have that column
        where_clause = " AND ".join(where_clauses)
        
        # Count total templates
        count_query = f"""
        SELECT COUNT(*) as total
        FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates`
        WHERE {where_clause}
        """
        count_result = list(client.query(count_query))[0]
        total_count = count_result.total
        
        # Get paginated templates
        query = f"""
        SELECT 
            template_id,
            project_id,
            template_hash,
            sql_pattern,
            full_sql,
            total_runs,
            total_bytes_processed,
            avg_runtime_seconds,
            p50_bytes_processed,
            p90_bytes_processed,
            first_seen,
            last_seen,
            state,
            analysis_result,
            compliance_score,
            optimization_score,
            estimated_savings_usd,
            created_at,
            updated_at
        FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates`
        WHERE {where_clause}
        {order_clause}
        LIMIT {limit}
        OFFSET {offset}
        """
        
        query_job = client.query(query)
        templates = []
        
        for row in query_job:
            # Calculate cost from bytes processed (binary TB * $5)
            total_tb = row.total_bytes_processed / (1024**4) if row.total_bytes_processed else 0
            total_cost = total_tb * 5.0
            
            template = {
                "template_id": row.template_id,
                "project_id": row.project_id,
                "template_hash": row.template_hash,
                "sql_snippet": row.sql_pattern[:200] if row.sql_pattern else "",
                "full_sql": row.full_sql,
                "execution_count": row.total_runs,
                "total_runs": row.total_runs,
                "total_cost_usd": round(total_cost, 4),
                "avg_cost_usd": round(total_cost / row.total_runs, 6) if row.total_runs else 0,
                "total_tb_billed": round(total_tb, 4),
                "total_bytes_processed": row.total_bytes_processed,
                "avg_runtime_seconds": float(row.avg_runtime_seconds) if row.avg_runtime_seconds else 0,
                "first_seen": row.first_seen.isoformat() if row.first_seen else None,
                "last_seen": row.last_seen.isoformat() if row.last_seen else None,
                "state": row.state,
                "analysis_result": json.loads(row.analysis_result) if row.analysis_result else None,
                "compliance_score": row.compliance_score if row.compliance_score else None,
                "optimization_score": row.optimization_score if row.optimization_score else None,
                "estimated_savings_usd": row.estimated_savings_usd if row.estimated_savings_usd else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None
            }
            
            templates.append(template)
        
        return {
            "success": True,
            "templates": templates,
            "pagination": {
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total_count
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project and its associated data"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Delete from projects table
        delete_project_query = f"""
        DELETE FROM `{BQ_PROJECT}.{BQ_DATASET}.projects`
        WHERE project_id = '{project_id}'
        """
        client.query(delete_project_query).result()
        
        # Delete associated templates
        delete_templates_query = f"""
        DELETE FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates`
        WHERE project_id = '{project_id}'
        """
        client.query(delete_templates_query).result()
        
        # Delete associated analyses
        delete_analyses_query = f"""
        DELETE FROM `{BQ_PROJECT}.{BQ_DATASET}.analyses`
        WHERE project_id = '{project_id}'
        """
        client.query(delete_analyses_query).result()
        
        return {
            "success": True,
            "message": f"Project {project_id} and all associated data deleted successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects")
async def get_projects():
    """Get all projects from bq_optimizer dataset"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = f"""
        SELECT 
            p.project_id,
            p.display_name,
            p.analysis_window,
            p.regions,
            p.datasets,
            p.pricing_mode,
            p.price_per_tb,
            p.is_active,
            p.created_at,
            p.updated_at,
            p.last_scan_at,
            COUNT(DISTINCT t.template_id) as templates_discovered,
            SUM(t.total_runs) as total_runs,
            SUM(t.total_bytes_processed) / POW(10, 12) as total_tb_processed,
            SUM(t.total_bytes_processed) / POW(10, 12) * p.price_per_tb as estimated_monthly_spend,
            0 as avg_compliance_score,  -- Will be calculated when analyses are available
            0 as potential_monthly_savings  -- Will be calculated when analyses are available
        FROM `{BQ_PROJECT}.{BQ_DATASET}.projects` p
        LEFT JOIN `{BQ_PROJECT}.{BQ_DATASET}.query_templates` t
            ON p.project_id = t.project_id
        WHERE p.is_active = true
        GROUP BY 
            p.project_id, p.display_name, p.analysis_window, 
            p.regions, p.datasets, p.pricing_mode, p.price_per_tb,
            p.is_active, p.created_at, p.updated_at, p.last_scan_at
        ORDER BY p.created_at DESC
        """
        
        query_job = client.query(query)
        results = list(query_job)
        
        projects = []
        for row in results:
            # Get top cost drivers for this project
            cost_drivers_query = f"""
            SELECT 
                SUBSTR(sql_pattern, 1, 100) as name,
                tables_used[SAFE_OFFSET(0)] as primary_table,
                total_runs as runs,
                ROUND(total_bytes_processed / POW(10, 9), 2) as gb_processed,
                ROUND((total_bytes_processed / POW(10, 12)) * {row.price_per_tb}, 2) as cost
            FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates`
            WHERE project_id = '{row.project_id}'
            ORDER BY total_bytes_processed DESC
            LIMIT 5
            """
            
            cost_drivers_job = client.query(cost_drivers_query)
            cost_drivers = []
            for driver in cost_drivers_job:
                cost_drivers.append({
                    "name": driver.name[:50] + "..." if len(driver.name) > 50 else driver.name,
                    "runs": driver.runs,
                    "bytesProcessed": f"{driver.gb_processed} GB",
                    "cost": driver.cost
                })
            
            projects.append({
                "id": f"proj_{row.project_id[:8]}",
                "projectId": row.project_id,
                "name": row.display_name,
                "lastUpdated": row.updated_at.isoformat() if row.updated_at else datetime.utcnow().isoformat(),
                "analysisWindow": row.analysis_window,
                "regions": row.regions or [],
                "datasets": row.datasets or [],
                "pricingMode": row.pricing_mode,
                "pricePerTB": float(row.price_per_tb),
                "stats": {
                    "templatesDiscovered": row.templates_discovered or 0,
                    "totalRuns": row.total_runs or 0,
                    "estimatedMonthlySpend": float(row.estimated_monthly_spend or 0),
                    "potentialSavings": float(row.potential_monthly_savings or 0),
                    "complianceScore": int(row.avg_compliance_score or 0)
                },
                "topCostDrivers": cost_drivers
            })
        
        return projects
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}/templates")
async def get_project_templates(project_id: str):
    """Get all templates for a specific project"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = f"""
        SELECT 
            t.template_id,
            t.project_id,
            t.template_hash,
            t.sql_pattern,
            t.full_sql,
            t.tables_used,
            t.first_seen,
            t.last_seen,
            t.total_runs,
            t.total_bytes_processed,
            t.p50_bytes_processed,
            t.p90_bytes_processed,
            t.p99_bytes_processed,
            t.avg_runtime_seconds,
            t.p50_runtime_seconds,
            t.p90_runtime_seconds,
            t.state,
            t.created_at,
            t.updated_at,
            t.total_runs / 30 as runs_per_day
        FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates` t
        WHERE t.project_id = '{project_id}'
        ORDER BY t.total_bytes_processed DESC
        """
        
        query_job = client.query(query)
        results = list(query_job)
        
        templates = []
        for row in results:
            templates.append({
                "id": row.template_id,
                "projectId": row.project_id,
                "sqlSnippet": row.sql_pattern[:200] if row.sql_pattern else "",
                "fullSql": row.full_sql,
                "tables": row.tables_used or [],
                "runs": row.total_runs,
                "runsPerDay": float(row.runs_per_day),
                "bytesProcessedP90": row.p90_bytes_processed or 0,
                "bytesProcessedP99": row.p99_bytes_processed or 0,
                "slotMsP50": 0,  # Not calculated yet
                "runtimeP50": float(row.p50_runtime_seconds or 0),
                "firstSeen": row.first_seen.isoformat() if row.first_seen else None,
                "lastSeen": row.last_seen.isoformat() if row.last_seen else None,
                "state": row.state,
                "lastAnalysis": None,  # Will be populated when analyses are available
                "complianceScore": None,
                "issues": [],
                "optimizedSql": None,
                "estimatedSavings": None
            })
        
        return templates
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/{project_id}/refresh")
async def refresh_project(project_id: str):
    """Refresh project data by rescanning queries"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Get project configuration
        config_query = f"""
        SELECT analysis_window
        FROM `{BQ_PROJECT}.{BQ_DATASET}.projects`
        WHERE project_id = '{project_id}'
        """
        
        config_job = client.query(config_query)
        config_result = list(config_job)
        
        if not config_result:
            raise HTTPException(status_code=404, detail="Project not found")
        
        analysis_window = config_result[0].analysis_window
        
        # Rescan the project
        scan_result = await scan_project(project_id, analysis_window)
        
        # Delete old templates for this project
        delete_query = f"""
        DELETE FROM `{BQ_PROJECT}.{BQ_DATASET}.query_templates`
        WHERE project_id = '{project_id}'
        """
        client.query(delete_query).result()
        
        # Insert new templates
        if scan_result["templates"]:
            template_table_id = f"{BQ_PROJECT}.{BQ_DATASET}.query_templates"
            template_table = client.get_table(template_table_id)
            
            template_rows = []
            for template in scan_result["templates"]:
                template_rows.append({
                    "template_id": template["template_id"],
                    "project_id": project_id,
                    "template_hash": template["template_hash"],
                    "sql_pattern": template["sql_pattern"],
                    "full_sql": template["full_sql"],
                    "tables_used": template["tables_used"],
                    "first_seen": template["first_seen"],
                    "last_seen": template["last_seen"],
                    "total_runs": template["total_runs"],
                    "total_bytes_processed": template["total_bytes_processed"],
                    "p50_bytes_processed": template.get("p50_bytes_processed", 0),
                    "p90_bytes_processed": template.get("p90_bytes_processed", 0),
                    "p99_bytes_processed": template.get("p99_bytes_processed", 0),
                    "avg_runtime_seconds": round(template.get("avg_runtime_seconds", 0), 2),
                    "p50_runtime_seconds": round(template.get("p50_runtime_seconds", 0), 2),
                    "p90_runtime_seconds": round(template.get("p90_runtime_seconds", 0), 2),
                    "state": "new",
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat()
                })
            
            errors = client.insert_rows_json(template_table, template_rows)
            if errors:
                print(f"Warning: Failed to insert some templates: {errors}")
        
        # Update last_scan_at
        update_query = f"""
        UPDATE `{BQ_PROJECT}.{BQ_DATASET}.projects`
        SET last_scan_at = CURRENT_TIMESTAMP(),
            updated_at = CURRENT_TIMESTAMP()
        WHERE project_id = '{project_id}'
        """
        
        client.query(update_query).result()
        
        return scan_result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Soft delete a project (mark as inactive)"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = f"""
        UPDATE `{BQ_PROJECT}.{BQ_DATASET}.projects`
        SET is_active = false,
            updated_at = CURRENT_TIMESTAMP()
        WHERE project_id = '{project_id}'
        """
        
        query_job = client.query(query)
        query_job.result()  # Wait for completion
        
        return {"success": True, "message": f"Project {project_id} has been deactivated"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# ANALYSES ENDPOINTS
# ============================================

@app.get("/api/analyses")
async def get_analyses(
    limit: int = Query(100, description="Maximum number of analyses to return"),
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    template_id: Optional[str] = Query(None, description="Filter by template ID"),
    status: Optional[str] = Query(None, description="Filter by analysis status")
):
    """Get recent analyses with optional filters"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Build query with filters
        query_parts = [f"""
        SELECT 
            analysis_id,
            template_id,
            project_id,
            original_query,
            analysis_type,
            analysis_status,
            ARRAY_LENGTH(issues_found) as issue_count,
            optimized_query,
            optimization_applied,
            original_bytes_processed,
            optimized_bytes_processed,
            bytes_saved,
            cost_saved_usd,
            savings_percentage,
            created_by,
            review_status,
            applied_to_production,
            created_at,
            updated_at,
            issues_found
        FROM `{BQ_PROJECT}.{BQ_DATASET}.analyses`
        WHERE 1=1
        """]
        
        if project_id:
            query_parts.append(f"AND project_id = '{project_id}'")
        if template_id:
            query_parts.append(f"AND template_id = '{template_id}'")
        if status:
            query_parts.append(f"AND analysis_status = '{status}'")
        
        query_parts.append(f"""
        ORDER BY created_at DESC
        LIMIT {limit}
        """)
        
        query = " ".join(query_parts)
        query_job = client.query(query)
        results = list(query_job)
        
        analyses = []
        for row in results:
            analyses.append({
                "analysis_id": row.analysis_id,
                "template_id": row.template_id,
                "project_id": row.project_id,
                "original_query": row.original_query[:200] if row.original_query else "",
                "query": row.original_query,  # Full query for frontend
                "analysis_type": row.analysis_type,
                "analysis_status": row.analysis_status,
                "issue_count": row.issue_count or 0,
                "optimized_query": row.optimized_query,
                "optimization_applied": row.optimization_applied,
                "original_bytes": row.original_bytes_processed,
                "optimized_bytes": row.optimized_bytes_processed,
                "bytes_saved": row.bytes_saved,
                "cost_saved": row.cost_saved_usd,
                "savings_percentage": row.savings_percentage,
                "created_by": row.created_by,
                "review_status": row.review_status,
                "applied_to_production": row.applied_to_production,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "issues_found": row.issues_found or []
            })
        
        return analyses
        
    except Exception as e:
        # If table doesn't exist, return empty array
        if "Table" in str(e) and "not found" in str(e):
            return []
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    """Get detailed analysis by ID"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = f"""
        SELECT 
            analysis_id,
            template_id,
            project_id,
            original_query,
            query_hash,
            analysis_type,
            analysis_status,
            issues_found,
            optimized_query,
            optimization_applied,
            optimization_notes,
            original_bytes_processed,
            optimized_bytes_processed,
            bytes_saved,
            cost_saved_usd,
            savings_percentage,
            original_runtime_ms,
            optimized_runtime_ms,
            runtime_improvement_percentage,
            validation_status,
            validation_errors,
            dry_run_successful,
            created_by,
            reviewed_by,
            review_status,
            review_notes,
            applied_to_production,
            created_at,
            updated_at,
            reviewed_at,
            tags,
            adk_session_id,
            stage_metadata,
            stage_rules,
            stage_optimization,
            stage_report,
            adk_response
        FROM `{BQ_PROJECT}.{BQ_DATASET}.analyses`
        WHERE analysis_id = '{analysis_id}'
        """
        
        query_job = client.query(query)
        results = list(query_job)
        
        if not results:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        row = results[0]
        
        # Format issues for response
        issues = []
        if row.issues_found:
            for issue in row.issues_found:
                issues.append({
                    "rule_id": issue.get("rule_id"),
                    "rule_name": issue.get("rule_name"),
                    "severity": issue.get("severity"),
                    "description": issue.get("description"),
                    "impact": issue.get("impact"),
                    "suggestion": issue.get("suggestion")
                })
        
        # Build stage_data from individual stage columns
        stage_data = {}
        
        # Parse each stage data field
        if row.stage_metadata:
            try:
                stage_data['metadata'] = json.loads(row.stage_metadata) if isinstance(row.stage_metadata, str) else row.stage_metadata
            except:
                pass
                
        if row.stage_rules:
            try:
                stage_data['rules'] = json.loads(row.stage_rules) if isinstance(row.stage_rules, str) else row.stage_rules
            except:
                pass
                
        if row.stage_optimization:
            try:
                stage_data['optimization'] = json.loads(row.stage_optimization) if isinstance(row.stage_optimization, str) else row.stage_optimization
            except:
                pass
                
        if row.stage_report:
            try:
                stage_data['report'] = json.loads(row.stage_report) if isinstance(row.stage_report, str) else row.stage_report
            except:
                pass
        
        # If stage_data is empty, try to extract from adk_response as fallback
        if not stage_data and row.adk_response:
            try:
                adk_data = json.loads(row.adk_response) if isinstance(row.adk_response, str) else row.adk_response
                if adk_data and 'metadata' in adk_data and 'stages' in adk_data['metadata']:
                    stage_data = adk_data['metadata']['stages']
            except Exception as e:
                print(f"Error parsing adk_response: {e}")
        
        return {
            "analysis_id": row.analysis_id,
            "template_id": row.template_id,
            "project_id": row.project_id,
            "original_query": row.original_query,
            "query_hash": row.query_hash,
            "analysis_type": row.analysis_type,
            "analysis_status": row.analysis_status,
            "issues_found": issues,
            "optimized_query": row.optimized_query,
            "optimization_applied": row.optimization_applied,
            "optimization_notes": row.optimization_notes,
            "original_bytes_processed": row.original_bytes_processed,
            "optimized_bytes_processed": row.optimized_bytes_processed,
            "bytes_saved": row.bytes_saved,
            "cost_saved_usd": row.cost_saved_usd,
            "savings_percentage": row.savings_percentage,
            "original_runtime_ms": row.original_runtime_ms,
            "optimized_runtime_ms": row.optimized_runtime_ms,
            "runtime_improvement_percentage": row.runtime_improvement_percentage,
            "validation_status": row.validation_status,
            "validation_errors": row.validation_errors or [],
            "dry_run_successful": row.dry_run_successful,
            "created_by": row.created_by,
            "reviewed_by": row.reviewed_by,
            "review_status": row.review_status,
            "review_notes": row.review_notes,
            "applied_to_production": row.applied_to_production,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
            "tags": row.tags or [],
            "adk_session_id": row.adk_session_id,
            "stage_data": stage_data  # Add stage_data for frontend display
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyses")
async def create_analysis(analysis: Analysis):
    """Create a new analysis (trigger optimization)"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        import uuid
        from datetime import datetime
        
        analysis_id = str(uuid.uuid4())
        query_hash = hash_pattern(analysis.query)
        
        # Insert new analysis record
        table_id = f"{BQ_PROJECT}.{BQ_DATASET}.analyses"
        
        # Extract data from result if provided
        issues_found = []
        optimized_query = None
        optimization_applied = False
        original_bytes = None
        optimized_bytes = None
        bytes_saved = None
        cost_saved = None
        savings_percentage = None
        
        # Extract stage data
        stage_metadata = None
        stage_rules = None
        stage_optimization = None
        stage_report = None
        
        if analysis.result:
            # Extract issues from result
            if 'issues' in analysis.result:
                for issue in analysis.result['issues']:
                    issues_found.append({
                        "rule_id": issue.get('id', ''),
                        "rule_name": issue.get('title', ''),
                        "severity": issue.get('severity', ''),
                        "description": issue.get('description', ''),
                        "impact": issue.get('impact', ''),
                        "suggestion": issue.get('suggestion', '')
                    })
            
            # Extract optimization data
            if 'optimizedQuery' in analysis.result:
                optimized_query = analysis.result['optimizedQuery']
                optimization_applied = True
            
            # Extract cost/performance metrics
            if 'validationResult' in analysis.result:
                validation = analysis.result['validationResult']
                original_bytes = validation.get('bytesProcessedOriginal')
                optimized_bytes = validation.get('bytesProcessedOptimized')
                bytes_saved = validation.get('bytesSaved')
                cost_saved = validation.get('costSaved')
                # Handle percentage - could be string like "50%" or number
                savings_pct = validation.get('costSavings', 0)
                if isinstance(savings_pct, str) and savings_pct.endswith('%'):
                    savings_percentage = float(savings_pct.rstrip('%'))
                else:
                    savings_percentage = savings_pct
            
            # Extract stage data from metadata
            if 'metadata' in analysis.result and 'stages' in analysis.result['metadata']:
                stages = analysis.result['metadata']['stages']
                stage_metadata = json.dumps(stages.get('metadata')) if 'metadata' in stages else None
                stage_rules = json.dumps(stages.get('rules')) if 'rules' in stages else None
                stage_optimization = json.dumps(stages.get('optimization')) if 'optimization' in stages else None
                stage_report = json.dumps(stages.get('report')) if 'report' in stages else None
        
        rows_to_insert = [{
            "analysis_id": analysis_id,
            "template_id": analysis.template_id,
            "project_id": analysis.project_id,
            "original_query": analysis.query,
            "query_hash": query_hash,
            "analysis_type": analysis.analysis_type,
            "analysis_status": "completed" if analysis.result else "pending",
            "created_by": analysis.created_by,
            "created_at": analysis.timestamp or datetime.utcnow().isoformat(),
            "optimization_applied": optimization_applied,
            "issues_found": issues_found,
            "optimized_query": optimized_query,
            "original_bytes_processed": original_bytes,
            "optimized_bytes_processed": optimized_bytes,
            "bytes_saved": bytes_saved,
            "cost_saved_usd": cost_saved,
            "savings_percentage": savings_percentage,
            "stage_metadata": stage_metadata,
            "stage_rules": stage_rules,
            "stage_optimization": stage_optimization,
            "stage_report": stage_report,
            "adk_response": json.dumps(analysis.result) if analysis.result else None
        }]
        
        # First, check if table exists and create if not
        try:
            client.get_table(table_id)
        except:
            # Table doesn't exist, create it
            print(f"Creating analyses table...")
            with open('schemas/analyses_table.sql', 'r') as f:
                create_table_query = f.read()
            client.query(create_table_query).result()
        
        # Insert the new analysis
        table = client.get_table(table_id)
        errors = client.insert_rows_json(table, rows_to_insert)
        
        if errors:
            raise Exception(f"Failed to insert analysis: {errors}")
        
        # TODO: Trigger actual analysis with Agent API
        # For now, return the created analysis
        return {
            "analysis_id": analysis_id,
            "status": "pending",
            "message": "Analysis created and queued for processing",
            "query": analysis.query[:200],
            "project_id": analysis.project_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/analyses/{analysis_id}")
async def update_analysis(analysis_id: str, update: AnalysisUpdate):
    """Update analysis (review, approve, etc.)"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Build update query
        update_parts = ["UPDATE `{BQ_PROJECT}.{BQ_DATASET}.analyses` SET"]
        update_fields = []
        
        if update.review_status is not None:
            update_fields.append(f"review_status = '{update.review_status}'")
            update_fields.append(f"reviewed_at = CURRENT_TIMESTAMP()")
        
        if update.review_notes is not None:
            update_fields.append(f"review_notes = '{update.review_notes}'")
        
        if update.applied_to_production is not None:
            update_fields.append(f"applied_to_production = {update.applied_to_production}")
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP()")
        
        query = f"""
        {update_parts[0]}
        {', '.join(update_fields)}
        WHERE analysis_id = '{analysis_id}'
        """
        
        query_job = client.query(query)
        query_job.result()
        
        return {"success": True, "message": "Analysis updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/analyses/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """Delete an analysis"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = f"""
        DELETE FROM `{BQ_PROJECT}.{BQ_DATASET}.analyses`
        WHERE analysis_id = '{analysis_id}'
        """
        
        query_job = client.query(query)
        query_job.result()
        
        return {"success": True, "message": "Analysis deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/analyze-tables")
async def analyze_project_tables(request: Dict[str, Any]):
    """Analyze tables using INFORMATION_SCHEMA and store results"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        custom_tables = request.get("custom_tables", None)
        
        # Analyze tables
        analysis_result = analyze_tables(client, project_id, custom_tables)
        
        if analysis_result["success"] and analysis_result["tables"]:
            # Store in BigQuery
            store_success = store_table_analysis(
                client,
                project_id,
                analysis_result["tables"]
            )
            analysis_result["stored"] = store_success
        
        return analysis_result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}/table-analysis")
async def get_table_analysis(project_id: str):
    """Get latest table analysis for a project"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = f"""
        SELECT *
        FROM `{BQ_PROJECT}.{BQ_DATASET}.table_analysis`
        WHERE project_id = '{project_id}'
          AND DATE(analysis_timestamp) = (
            SELECT MAX(DATE(analysis_timestamp))
            FROM `{BQ_PROJECT}.{BQ_DATASET}.table_analysis`
            WHERE project_id = '{project_id}'
          )
        ORDER BY total_logical_gb DESC
        """
        
        query_job = client.query(query)
        results = list(query_job.result())
        
        tables = []
        total_storage_gb = 0
        total_storage_cost = 0
        total_query_cost = 0
        
        for row in results:
            table_data = {
                "project_id": row.project_id,
                "dataset_id": row.dataset_id,
                "table_name": row.table_name,
                "full_table_name": row.full_table_name,
                "table_type": row.table_type,
                "table_creation_time": row.table_creation_time.isoformat() if row.table_creation_time else None,
                "table_age_days": row.table_age_days,
                "table_description": row.table_description,
                "is_partitioned": row.is_partitioned,
                "partition_field": row.partition_field,
                "require_partition_filter": row.require_partition_filter,
                "is_clustered": row.is_clustered,
                "cluster_fields_raw": row.cluster_fields_raw,
                "total_logical_gb": float(row.total_logical_gb) if row.total_logical_gb else 0,
                "active_logical_gb": float(row.active_logical_gb) if row.active_logical_gb else 0,
                "long_term_logical_gb": float(row.long_term_logical_gb) if row.long_term_logical_gb else 0,
                "active_storage_cost_monthly_usd": float(row.active_storage_cost_monthly_usd) if row.active_storage_cost_monthly_usd else 0,
                "long_term_storage_cost_monthly_usd": float(row.long_term_storage_cost_monthly_usd) if row.long_term_storage_cost_monthly_usd else 0,
                "total_queries_6m": row.total_queries_6m,
                "unique_users_6m": row.unique_users_6m,
                "total_tb_billed": float(row.total_tb_billed) if row.total_tb_billed else 0,
                "total_query_cost_6m_usd": float(row.total_query_cost_6m_usd) if row.total_query_cost_6m_usd else 0,
                "last_queried_time": row.last_queried_time.isoformat() if row.last_queried_time else None,
                "analysis_timestamp": row.analysis_timestamp.isoformat() if row.analysis_timestamp else None
            }
            
            tables.append(table_data)
            total_storage_gb += table_data["total_logical_gb"]
            total_storage_cost += table_data["active_storage_cost_monthly_usd"] + table_data["long_term_storage_cost_monthly_usd"]
            total_query_cost += table_data["total_query_cost_6m_usd"]
        
        return {
            "success": True,
            "project_id": project_id,
            "tables": tables,
            "summary": {
                "total_tables": len(tables),
                "total_storage_gb": round(total_storage_gb, 2),
                "total_storage_cost_monthly": round(total_storage_cost, 2),
                "total_query_cost_6m": round(total_query_cost, 2),
                "unused_tables_count": sum(1 for t in tables if t["total_queries_6m"] == 0),
                "partitioned_tables": sum(1 for t in tables if t["is_partitioned"]),
                "clustered_tables": sum(1 for t in tables if t["is_clustered"])
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Rules Management Endpoints (using BigQuery)
@app.get("/api/rules")
async def get_all_rules():
    """Get all BigQuery anti-pattern rules from BigQuery table"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Query rules from BigQuery table
        query = f"""
        SELECT 
            rule_id,
            title,
            description,
            severity,
            category,
            enabled,
            detect_pattern,
            fix_suggestion,
            impact,
            tags,
            created_at,
            updated_at
        FROM `{BQ_PROJECT}.{BQ_DATASET}.bq_anti_pattern_rules`
        WHERE enabled = true
        ORDER BY severity DESC, rule_id
        """
        
        query_job = client.query(query)
        results = list(query_job)
        
        rules = []
        for row in results:
            rules.append({
                'docId': row.rule_id,
                'id': row.rule_id,
                'title': row.title,
                'description': row.description,
                'severity': row.severity,
                'category': row.category,
                'enabled': row.enabled,
                'detect': row.detect_pattern,
                'fix': row.fix_suggestion,
                'impact': row.impact,
                'tags': row.tags.split(',') if row.tags else [],
                'createdAt': row.created_at.isoformat() if row.created_at else None,
                'updatedAt': row.updated_at.isoformat() if row.updated_at else None
            })
        return rules
    except Exception as e:
        logger.error(f"Error fetching rules: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rules/{rule_id}")
async def get_rule(rule_id: str):
    """Get a specific rule by ID from BigQuery"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = f"""
        SELECT 
            rule_id,
            title,
            description,
            severity,
            category,
            enabled,
            detect_pattern,
            fix_suggestion,
            impact,
            tags,
            created_at,
            updated_at
        FROM `{BQ_PROJECT}.{BQ_DATASET}.bq_anti_pattern_rules`
        WHERE rule_id = '{rule_id}'
        LIMIT 1
        """
        
        query_job = client.query(query)
        results = list(query_job)
        
        if not results:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        row = results[0]
        return {
            'docId': row.rule_id,
            'id': row.rule_id,
            'title': row.title,
            'description': row.description,
            'severity': row.severity,
            'category': row.category,
            'enabled': row.enabled,
            'detect': row.detect_pattern,
            'fix': row.fix_suggestion,
            'impact': row.impact,
            'tags': row.tags.split(',') if row.tags else [],
            'createdAt': row.created_at.isoformat() if row.created_at else None,
            'updatedAt': row.updated_at.isoformat() if row.updated_at else None
        }
    except Exception as e:
        logger.error(f"Error fetching rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/rules/{rule_id}")
async def update_rule(rule_id: str, rule: Dict[str, Any] = Body(...)):
    """Update an existing rule in BigQuery"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Build UPDATE statement
        update_fields = []
        if 'title' in rule:
            update_fields.append(f"title = '{rule['title']}'")
        if 'severity' in rule:
            update_fields.append(f"severity = '{rule['severity']}'")
        if 'enabled' in rule:
            update_fields.append(f"enabled = {rule['enabled']}")
        if 'detect' in rule:
            update_fields.append(f"detect_pattern = '{rule['detect']}'")
        if 'fix' in rule:
            update_fields.append(f"fix_suggestion = '{rule['fix']}'")
        if 'category' in rule:
            update_fields.append(f"category = '{rule['category']}'")
        if 'impact' in rule:
            update_fields.append(f"impact = '{rule['impact']}'")
        if 'tags' in rule:
            tags_str = ','.join(rule['tags']) if isinstance(rule['tags'], list) else rule['tags']
            update_fields.append(f"tags = '{tags_str}'")
        
        update_fields.append(f"updated_at = CURRENT_TIMESTAMP()")
        
        update_query = f"""
        UPDATE `{BQ_PROJECT}.{BQ_DATASET}.bq_anti_pattern_rules`
        SET {', '.join(update_fields)}
        WHERE rule_id = '{rule_id}'
        """
        
        query_job = client.query(update_query)
        query_job.result()  # Wait for completion
        
        # Return updated rule
        return await get_rule(rule_id)
    except Exception as e:
        logger.error(f"Error updating rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str, enabled: bool = Body(...)):
    """Toggle a rule's enabled status in BigQuery"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        update_query = f"""
        UPDATE `{BQ_PROJECT}.{BQ_DATASET}.bq_anti_pattern_rules`
        SET enabled = {enabled}, updated_at = CURRENT_TIMESTAMP()
        WHERE rule_id = '{rule_id}'
        """
        
        query_job = client.query(update_query)
        query_job.result()  # Wait for completion
        
        return {"success": True, "message": f"Rule {rule_id} {'enabled' if enabled else 'disabled'}"}
    except Exception as e:
        logger.error(f"Error toggling rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rules")
async def create_rule(rule: Dict[str, Any] = Body(...)):
    """Create a new rule in BigQuery"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        rule_id = rule.get('id')
        if not rule_id:
            raise HTTPException(status_code=400, detail="Rule ID is required")
        
        # Check if rule exists
        check_query = f"""
        SELECT COUNT(*) as count
        FROM `{BQ_PROJECT}.{BQ_DATASET}.bq_anti_pattern_rules`
        WHERE rule_id = '{rule_id}'
        """
        
        query_job = client.query(check_query)
        results = list(query_job)
        if results[0].count > 0:
            raise HTTPException(status_code=409, detail="Rule already exists")
        
        # Insert new rule
        tags_str = ','.join(rule.get('tags', [])) if isinstance(rule.get('tags'), list) else rule.get('tags', '')
        
        insert_query = f"""
        INSERT INTO `{BQ_PROJECT}.{BQ_DATASET}.bq_anti_pattern_rules`
        (rule_id, title, description, severity, category, enabled, detect_pattern, fix_suggestion, impact, tags, created_at, updated_at)
        VALUES (
            '{rule_id}',
            '{rule.get('title', '')}',
            '{rule.get('description', rule.get('detect', ''))}',
            '{rule.get('severity', 'medium')}',
            '{rule.get('category', 'General')}',
            {rule.get('enabled', True)},
            '{rule.get('detect', '')}',
            '{rule.get('fix', '')}',
            '{rule.get('impact', '')}',
            '{tags_str}',
            CURRENT_TIMESTAMP(),
            CURRENT_TIMESTAMP()
        )
        """
        
        query_job = client.query(insert_query)
        query_job.result()  # Wait for completion
        
        # Return created rule
        return await get_rule(rule_id)
    except Exception as e:
        logger.error(f"Error creating rule: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: str):
    """Delete a rule from BigQuery"""
    if not client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        delete_query = f"""
        DELETE FROM `{BQ_PROJECT}.{BQ_DATASET}.bq_anti_pattern_rules`
        WHERE rule_id = '{rule_id}'
        """
        
        query_job = client.query(delete_query)
        query_job.result()  # Wait for completion
        
        if query_job.num_dml_affected_rows == 0:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        return {"success": True, "message": f"Rule {rule_id} deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("startup")
async def startup_event():
    """Log startup information"""
    logger.info("="*60)
    logger.info("BigQuery Optimizer Backend API Starting")
    logger.info(f"Environment: {Config.APP_ENV}")
    logger.info(f"GCP Project: {Config.GCP_PROJECT_ID}")
    logger.info(f"BQ Project: {Config.BQ_PROJECT_ID}")
    logger.info(f"BQ Dataset: {Config.BQ_DATASET}")
    logger.info(f"CORS Origins: {Config.CORS_ORIGINS}")
    logger.info(f"BigQuery Client: {'Initialized' if client else 'Not Available'}")
    logger.info("="*60)

@app.get("/health")
async def health_check():
    """Health check endpoint with detailed status"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": Config.APP_ENV,
        "services": {
            "bigquery": "connected" if client else "disconnected"
        },
        "configuration": {
            "gcp_project": Config.GCP_PROJECT_ID,
            "bq_project": Config.BQ_PROJECT_ID,
            "bq_dataset": Config.BQ_DATASET
        }
    }
    return health_status

if __name__ == "__main__":
    import uvicorn
    
    port = Config.BACKEND_API_PORT
    logger.info(f"Starting server on port {port}")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_config={
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                },
            },
            "handlers": {
                "default": {
                    "formatter": "default",
                    "class": "logging.StreamHandler",
                },
            },
            "root": {
                "level": Config.LOG_LEVEL,
                "handlers": ["default"],
            },
        }
    )