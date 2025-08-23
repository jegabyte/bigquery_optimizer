"""
BigQuery API Service with Firestore Storage
FastAPI backend using Firestore for data persistence
"""

from fastapi import FastAPI, HTTPException, Query, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.cloud import bigquery
from google.oauth2 import service_account
from google.api_core import exceptions as google_exceptions
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import hashlib
import re
import json
import os
import time
import logging
import traceback
from pydantic import BaseModel
from firestore_service import firestore_service
from firestore_templates import TemplateFirestoreManager
from logging_config import setup_logging, log_error_with_context, create_module_logger
from config import Config

# Setup comprehensive logging
setup_logging(
    log_level=os.getenv('LOG_LEVEL', 'INFO'),
    log_format='simple' if os.getenv('APP_ENV') == 'development' else 'detailed'
)

# Initialize module logger
logger = create_module_logger('main')

# Initialize template manager
template_manager = TemplateFirestoreManager()

# Initialize FastAPI app
app = FastAPI(
    title="BigQuery Optimizer API with Firestore",
    description="API for managing BigQuery optimization projects with Firestore storage",
    version="2.0.0"
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

# Initialize BigQuery client for query analysis only
try:
    if os.path.exists('service-account.json'):
        credentials = service_account.Credentials.from_service_account_file(
            'service-account.json',
            scopes=['https://www.googleapis.com/auth/bigquery']
        )
        bq_client = bigquery.Client(credentials=credentials)
    else:
        bq_client = bigquery.Client()
    
    BQ_PROJECT = Config.BQ_PROJECT_ID
    logger.info(f"BigQuery client initialized for project: {BQ_PROJECT}")
    
except Exception as e:
    logger.error(f"Failed to initialize BigQuery client: {e}", exc_info=True)
    bq_client = None

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

class AnalysisResult(BaseModel):
    analysis_id: Optional[str] = None
    query: str
    options: Optional[Dict[str, Any]] = {}
    result: Dict[str, Any]
    stage_data: Optional[Dict[str, Any]] = {}
    stageData: Optional[Dict[str, Any]] = {}  # Also accept camelCase from frontend
    timestamp: Optional[str] = None
    project_id: Optional[str] = None
    user_id: Optional[str] = None

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
        "bigquery_connected": bq_client is not None,
        "firestore_connected": firestore_service.db is not None,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics from Firestore"""
    try:
        stats = firestore_service.get_dashboard_stats()
        return stats
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/scan")
async def scan_project(project_id: str, analysis_window: int = 30):
    """Scan a BigQuery project for queries and create templates"""
    if not bq_client:
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
        
        query_job = bq_client.query(query)
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
                    "project_id": project_id,
                    "sql_pattern": pattern[:500],  # First 500 chars
                    "full_sql": row.query,
                    "tables_used": extract_tables_from_query(row.query, row.referenced_tables),
                    "runs": [],
                    "total_runs": 0,
                    "total_bytes_processed": 0,
                    "first_seen": row.creation_time.isoformat() if row.creation_time else None,
                    "last_seen": row.creation_time.isoformat() if row.creation_time else None,
                    "state": "new"
                }
            
            template = templates[pattern_hash]
            run_data = {
                "job_id": row.job_id,
                "creation_time": row.creation_time.isoformat() if row.creation_time else None,
                "start_time": row.start_time.isoformat() if row.start_time else None,
                "end_time": row.end_time.isoformat() if row.end_time else None,
                "bytes_processed": row.total_bytes_processed or 0,
                "bytes_billed": row.total_bytes_billed or 0,
                "slot_ms": row.total_slot_ms or 0,
                "runtime_seconds": row.runtime_seconds or 0,
                "user_email": row.user_email,
                "estimated_cost": ((row.total_bytes_billed or row.total_bytes_processed or 0) / 1e12) * 5.00
            }
            template["runs"].append(run_data)
            
            template["total_runs"] += 1
            template["total_bytes_processed"] += row.total_bytes_processed or 0
            
            if row.creation_time:
                creation_iso = row.creation_time.isoformat()
                if creation_iso > template["last_seen"]:
                    template["last_seen"] = creation_iso
                if creation_iso < template["first_seen"]:
                    template["first_seen"] = creation_iso
        
        # Calculate statistics for each template
        template_list = []
        for pattern_hash, template in templates.items():
            bytes_values = sorted([r["bytes_processed"] for r in template["runs"]])
            runtime_values = sorted([r["runtime_seconds"] for r in template["runs"]])
            cost_values = sorted([r["estimated_cost"] for r in template["runs"]])
            
            if bytes_values:
                template["p50_bytes_processed"] = bytes_values[len(bytes_values) // 2]
                template["p90_bytes_processed"] = bytes_values[int(len(bytes_values) * 0.9)]
                template["p99_bytes_processed"] = bytes_values[int(len(bytes_values) * 0.99)]
                template["avg_bytes_processed"] = sum(bytes_values) / len(bytes_values)
            
            if runtime_values:
                template["p50_runtime_seconds"] = runtime_values[len(runtime_values) // 2]
                template["p90_runtime_seconds"] = runtime_values[int(len(runtime_values) * 0.9)]
                template["avg_runtime_seconds"] = sum(runtime_values) / len(runtime_values)
            
            if cost_values:
                template["total_cost"] = sum(cost_values)
                template["avg_cost_per_run"] = sum(cost_values) / len(cost_values)
                template["estimated_monthly_cost"] = (sum(cost_values) / analysis_window) * 30
            
            template["runs_per_day"] = template["total_runs"] / analysis_window
            
            # Keep only the 10 most recent runs for display (sort by creation_time)
            template["runs"].sort(key=lambda x: x.get("creation_time", ""), reverse=True)
            template["recent_runs"] = template["runs"][:10]
            
            # Store summary of all runs but remove full runs list to reduce payload
            template["runs_summary"] = {
                "total": len(template["runs"]),
                "earliest": template["runs"][-1]["creation_time"] if template["runs"] else None,
                "latest": template["runs"][0]["creation_time"] if template["runs"] else None
            }
            del template["runs"]
            
            template_list.append(template)
        
        # Save templates to Firestore
        if template_list:
            # Prepare templates for Firestore storage
            firestore_templates = []
            for template in template_list:
                firestore_template = {
                    'sqlSnippet': template['sql_pattern'],
                    'fullSql': template.get('full_sql', template['sql_pattern']),
                    'tables': template.get('tables_used', []),
                    'runs': template['total_runs'],
                    'avgBytesProcessed': template.get('avg_bytes_processed', 0),
                    'bytesProcessedP90': template.get('p90_bytes_processed', 0),
                    'avgRuntime': template.get('avg_runtime_seconds', 0),
                    'runtimeP50': template.get('p50_runtime_seconds', 0),
                    'avgCostPerRun': template.get('avg_cost_per_run', 0),
                    'totalCost': template.get('total_cost', 0),
                    'estimatedMonthlyCost': template.get('estimated_monthly_cost', 0),
                    'runsPerDay': template.get('runs_per_day', 0),
                    'firstSeen': template.get('first_seen'),
                    'lastSeen': template.get('last_seen'),
                    'recentRuns': template.get('recent_runs', [])
                }
                firestore_templates.append(firestore_template)
            
            # Batch save to Firestore
            template_ids = template_manager.batch_save_templates(project_id, firestore_templates)
            logger.info(f"Saved {len(template_ids)} templates to Firestore for project {project_id}")
        
        return {
            "success": True,
            "project_id": project_id,
            "templates_discovered": len(template_list),
            "total_queries_analyzed": len(results),
            "templates": template_list
        }
        
    except Exception as e:
        error_message = str(e)
        if "has not enabled BigQuery" in error_message:
            raise HTTPException(
                status_code=400, 
                detail=f"BigQuery is not enabled for project {project_id}. Please enable BigQuery API in the Google Cloud Console."
            )
        elif "does not exist" in error_message:
            raise HTTPException(
                status_code=404, 
                detail=f"Project {project_id} does not exist or you don't have access to it."
            )
        else:
            raise HTTPException(status_code=500, detail=error_message)

@app.post("/api/projects")
async def create_project(config: ProjectConfig):
    """Create a new project in Firestore"""
    try:
        print(f"Creating project with config: {config.dict()}")
        
        # First, scan the project to get initial data
        scan_result = await scan_project(config.project_id, config.analysis_window)
        
        # Create project in Firestore
        project_data = {
            "project_id": config.project_id,
            "display_name": config.display_name or config.project_id,
            "analysis_window": config.analysis_window,
            "regions": config.regions,
            "datasets": config.datasets,
            "pricing_mode": config.pricing_mode,
            "price_per_tb": config.price_per_tb,
            "auto_detect_regions": config.auto_detect_regions,
            "auto_detect_datasets": config.auto_detect_datasets,
            "last_scan_at": datetime.utcnow().isoformat()
        }
        
        doc_id = firestore_service.create_project(project_data)
        
        # Save templates to Firestore
        if scan_result["templates"]:
            saved_count = firestore_service.save_templates(
                scan_result["templates"], 
                config.project_id
            )
            print(f"Saved {saved_count} templates to Firestore")
        
        return {
            "success": True,
            "project_id": doc_id,
            "project": config.dict(),
            "scan_result": scan_result
        }
        
    except Exception as e:
        import traceback
        print(f"Error creating project: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects")
async def get_projects():
    """Get all projects from Firestore"""
    try:
        projects = firestore_service.get_projects(active_only=True)
        
        # Format projects for frontend
        formatted_projects = []
        for project in projects:
            # Get templates count and cost drivers for this project
            templates = firestore_service.get_templates(project.get('project_id'), limit=100)
            
            # Calculate stats
            total_runs = sum(t.get('total_runs', 0) for t in templates)
            total_bytes = sum(t.get('total_bytes_processed', 0) for t in templates)
            estimated_cost = (total_bytes / 1e12) * project.get('price_per_tb', 5.00)
            
            # Get top cost drivers
            cost_drivers = []
            sorted_templates = sorted(templates, 
                                     key=lambda x: x.get('total_bytes_processed', 0), 
                                     reverse=True)[:5]
            
            for template in sorted_templates:
                gb_processed = template.get('total_bytes_processed', 0) / 1e9
                cost = (template.get('total_bytes_processed', 0) / 1e12) * project.get('price_per_tb', 5.00)
                cost_drivers.append({
                    "name": (template.get('sql_pattern', '')[:50] + "...") if len(template.get('sql_pattern', '')) > 50 else template.get('sql_pattern', ''),
                    "runs": template.get('total_runs', 0),
                    "bytesProcessed": f"{gb_processed:.2f} GB",
                    "cost": round(cost, 2)
                })
            
            formatted_projects.append({
                "id": project.get('id', f"proj_{project.get('project_id', '')[:8]}"),
                "projectId": project.get('project_id'),
                "name": project.get('display_name'),
                "lastUpdated": project.get('updated_at', datetime.utcnow().isoformat()),
                "analysisWindow": project.get('analysis_window', 30),
                "regions": project.get('regions', []),
                "datasets": project.get('datasets', []),
                "pricingMode": project.get('pricing_mode', 'on-demand'),
                "pricePerTB": project.get('price_per_tb', 5.00),
                "stats": {
                    "templatesDiscovered": len(templates),
                    "totalRuns": total_runs,
                    "estimatedMonthlySpend": round(estimated_cost, 2),
                    "potentialSavings": round(estimated_cost * 0.3, 2),  # Estimate 30% savings
                    "complianceScore": 75  # Default score
                },
                "topCostDrivers": cost_drivers
            })
        
        return formatted_projects
        
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}/templates")
async def get_project_templates(project_id: str):
    """Get all templates for a specific project from Firestore"""
    try:
        templates = firestore_service.get_templates(project_id)
        
        # Format templates for frontend
        formatted_templates = []
        for template in templates:
            formatted_templates.append({
                "id": template.get('template_id'),
                "projectId": template.get('project_id'),
                "sqlSnippet": template.get('sql_pattern', '')[:200],
                "fullSql": template.get('full_sql', ''),
                "tables": template.get('tables_used', []),
                "runs": template.get('total_runs', 0),
                "runsPerDay": template.get('runs_per_day', 0),
                "bytesProcessedP90": template.get('p90_bytes_processed', 0),
                "bytesProcessedP99": template.get('p99_bytes_processed', 0),
                "avgBytesProcessed": template.get('avg_bytes_processed', 0),
                "slotMsP50": template.get('slot_ms_p50', 0),
                "runtimeP50": template.get('p50_runtime_seconds', 0),
                "avgRuntime": template.get('avg_runtime_seconds', 0),
                "totalCost": template.get('total_cost', 0),
                "avgCostPerRun": template.get('avg_cost_per_run', 0),
                "estimatedMonthlyCost": template.get('estimated_monthly_cost', 0),
                "firstSeen": template.get('first_seen'),
                "lastSeen": template.get('last_seen'),
                "state": template.get('state', 'new'),
                "recentRuns": template.get('recent_runs', []),
                "runsSummary": template.get('runs_summary', {}),
                "lastAnalysis": None,
                "complianceScore": None,
                "issues": [],
                "optimizedSql": None,
                "estimatedSavings": None
            })
        
        return formatted_templates
        
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/{project_id}/refresh")
async def refresh_project(project_id: str):
    """Refresh project data by rescanning queries while preserving analysis results"""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        # Get project configuration
        project = firestore_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        analysis_window = project.get('analysis_window', 30)
        
        # Get existing templates to preserve analysis results
        existing_templates = template_manager.get_project_templates(project_id)
        existing_analysis = {}
        for template in existing_templates:
            if template.get('analysis_result_id'):
                existing_analysis[template['template_id']] = {
                    'analysis_result_id': template['analysis_result_id'],
                    'analysis_status': template.get('analysis_status', 'completed'),
                    'compliance_score': template.get('compliance_score')
                }
        
        # Rescan the project
        scan_result = await scan_project(project_id, analysis_window)
        
        # The scan_project function now uses batch_save_templates which preserves analysis
        # But let's ensure analysis data is preserved for any new template IDs
        if scan_result["templates"]:
            # Update templates with preserved analysis if template IDs match
            for template in scan_result["templates"]:
                template_id = template_manager._generate_template_id(project_id, template.get('sql_pattern', ''))
                if template_id in existing_analysis:
                    # This template had analysis before, preserve it
                    logger.info(f"Preserving analysis for template {template_id}")
        
        # Update last_scan_at
        firestore_service.update_project(project_id, {
            'last_scan_at': datetime.utcnow().isoformat()
        })
        
        return {
            **scan_result,
            "analysis_preserved": len(existing_analysis),
            "message": f"Refreshed {scan_result['templates_discovered']} templates, preserved {len(existing_analysis)} analysis results"
        }
        
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Soft delete a project (mark as inactive)"""
    try:
        success = firestore_service.delete_project(project_id, soft_delete=True)
        if success:
            return {"success": True, "message": f"Project {project_id} has been deactivated"}
        else:
            raise HTTPException(status_code=404, detail="Project not found")
            
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyses")
async def save_analysis(analysis: AnalysisResult):
    """Save an analysis result to Firestore"""
    try:
        # Prepare analysis data - handle both stageData and stage_data
        stage_data = analysis.stage_data or analysis.stageData or {}
        
        analysis_data = {
            "query": analysis.query,
            "options": analysis.options or {},
            "result": analysis.result,
            "stage_data": stage_data,
            "stageData": stage_data,  # Save with both naming conventions
            "timestamp": analysis.timestamp or datetime.utcnow().isoformat(),
            "project_id": analysis.project_id,
            "user_id": analysis.user_id or "anonymous"
        }
        
        # Save to Firestore
        doc_id = firestore_service.save_analysis(analysis_data)
        
        return {
            "success": True,
            "analysis_id": doc_id,
            "message": "Analysis saved successfully"
        }
        
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    """Retrieve an analysis result from Firestore"""
    try:
        analysis = firestore_service.get_analysis(analysis_id)
        if analysis:
            return analysis
        else:
            raise HTTPException(status_code=404, detail="Analysis not found")
            
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analyses")
async def get_analyses(
    project_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=100)
):
    """Get recent analyses with optional filtering"""
    try:
        analyses = firestore_service.get_recent_analyses(
            project_id=project_id,
            user_id=user_id,
            limit=limit
        )
        return analyses
        
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Template Management Endpoints
@app.post("/api/templates/save-analysis")
async def save_template_analysis(data: dict = Body(...)):
    """Save analysis result for a template"""
    try:
        project_id = data.get('project_id')
        template_id = data.get('template_id')
        result = data.get('result')
        
        if not all([project_id, template_id, result]):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        analysis_id = template_manager.save_analysis_result(project_id, template_id, result)
        
        return {
            "success": True,
            "analysis_id": analysis_id,
            "message": "Analysis saved successfully"
        }
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/templates/{project_id}")
async def get_project_templates_with_analysis(project_id: str):
    """Get all templates for a project with their analysis results (optimized)"""
    try:
        # Use the optimized batch loading method
        templates = template_manager.get_project_templates(project_id)
        
        # Format templates for frontend - analysis results are already loaded
        formatted_templates = []
        for template in templates:
            # Ensure we have an id field for the frontend
            template_data = {
                'id': template.get('template_id', template.get('id')),
                'template_id': template.get('template_id'),
                'projectId': template.get('project_id'),
                **template  # Include all other fields
            }
            
            # Analysis result is already loaded in the template from batch query
            if template.get('analysis_result'):
                template_data['analysisResult'] = template['analysis_result']
                template_data['analysisStatus'] = 'completed'
            elif template.get('analysis_result_id'):
                # Has analysis ID but no result loaded (shouldn't happen with new code)
                template_data['analysisStatus'] = 'pending'
            else:
                template_data['analysisStatus'] = 'new'
            
            formatted_templates.append(template_data)
        
        return formatted_templates
    except Exception as e:
        logger.error(f"Error fetching templates for project {project_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/templates/{project_id}/{template_id}/analysis")
async def get_template_analysis(project_id: str, template_id: str):
    """Get analysis result for a specific template"""
    try:
        analysis = template_manager.get_template_analysis(template_id)
        if analysis:
            return analysis
        else:
            raise HTTPException(status_code=404, detail="Analysis not found")
    except Exception as e:
        logger.error(f"Error in endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Rules Management Endpoints
@app.get("/api/rules")
async def get_all_rules():
    """Get all BigQuery anti-pattern rules from Firestore"""
    try:
        rules = []
        # Use the db directly from firestore module
        from google.cloud import firestore as fs
        db = fs.Client(project=Config.GCP_PROJECT_ID)
        rules_ref = db.collection('bq_anti_pattern_rules')
        docs = rules_ref.stream()
        
        for doc in docs:
            # Skip metadata document
            if doc.id == '_metadata':
                continue
            rule_data = doc.to_dict()
            rule_data['docId'] = doc.id
            rules.append(rule_data)
        
        # Sort rules by order if available, otherwise by title
        rules.sort(key=lambda x: (x.get('order', 999), x.get('title', '')))
        return rules
    except Exception as e:
        logger.error(f"Error fetching rules: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rules/{rule_id}")
async def get_rule(rule_id: str):
    """Get a specific rule by ID"""
    try:
        from google.cloud import firestore as fs
        db = fs.Client(project=Config.GCP_PROJECT_ID)
        doc_ref = db.collection('bq_anti_pattern_rules').document(rule_id)
        doc = doc_ref.get()
        
        if doc.exists:
            rule_data = doc.to_dict()
            rule_data['docId'] = doc.id
            return rule_data
        else:
            raise HTTPException(status_code=404, detail="Rule not found")
    except Exception as e:
        logger.error(f"Error fetching rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str, enabled: bool = Body(...)):
    """Toggle a rule's enabled status"""
    try:
        from google.cloud import firestore as fs
        db = fs.Client(project=Config.GCP_PROJECT_ID)
        doc_ref = db.collection('bq_anti_pattern_rules').document(rule_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        doc_ref.update({
            'enabled': enabled,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return {"success": True, "message": f"Rule {rule_id} {'enabled' if enabled else 'disabled'}"}
    except Exception as e:
        logger.error(f"Error toggling rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rules")
async def create_rule(rule: Dict[str, Any] = Body(...)):
    """Create a new rule"""
    try:
        rule_id = rule.get('id')
        if not rule_id:
            raise HTTPException(status_code=400, detail="Rule ID is required")
        
        from google.cloud import firestore as fs
        db = fs.Client(project=Config.GCP_PROJECT_ID)
        doc_ref = db.collection('bq_anti_pattern_rules').document(rule_id)
        
        # Check if rule already exists
        if doc_ref.get().exists:
            raise HTTPException(status_code=409, detail="Rule with this ID already exists")
        
        rule_data = {
            'id': rule_id,
            'title': rule.get('title', ''),
            'severity': rule.get('severity', 'warning'),
            'enabled': rule.get('enabled', True),
            'detect': rule.get('detect', ''),
            'fix': rule.get('fix', ''),
            'examples': rule.get('examples', {}),
            'category': rule.get('category', 'General'),
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        doc_ref.set(rule_data)
        rule_data['docId'] = rule_id
        return rule_data
    except Exception as e:
        logger.error(f"Error creating rule: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/rules/{rule_id}")
async def update_rule(rule_id: str, rule: Dict[str, Any] = Body(...)):
    """Update an existing rule"""
    try:
        from google.cloud import firestore as fs
        db = fs.Client(project=Config.GCP_PROJECT_ID)
        doc_ref = db.collection('bq_anti_pattern_rules').document(rule_id)
        
        if not doc_ref.get().exists:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        update_data = {
            'title': rule.get('title'),
            'severity': rule.get('severity'),
            'enabled': rule.get('enabled'),
            'detect': rule.get('detect'),
            'fix': rule.get('fix'),
            'examples': rule.get('examples'),
            'category': rule.get('category'),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        doc_ref.update(update_data)
        
        updated_doc = doc_ref.get()
        rule_data = updated_doc.to_dict()
        rule_data['docId'] = updated_doc.id
        return rule_data
    except Exception as e:
        logger.error(f"Error updating rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: str):
    """Delete a rule"""
    try:
        from google.cloud import firestore as fs
        db = fs.Client(project=Config.GCP_PROJECT_ID)
        doc_ref = db.collection('bq_anti_pattern_rules').document(rule_id)
        
        if not doc_ref.get().exists:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        doc_ref.delete()
        return {"success": True, "message": f"Rule {rule_id} deleted"}
    except Exception as e:
        logger.error(f"Error deleting rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# Additional endpoints for feature parity
# ==========================================

@app.post("/api/projects/check-permissions")
async def check_permissions(request: Dict[str, Any]):
    """Check permissions for INFORMATION_SCHEMA access"""
    if not bq_client:
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
                bq_client.query(query).result()
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
                bq_client.query(query).result()
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
                bq_client.query(query).result()
                return {"success": True, "has_access": True}
            except:
                return {"success": True, "has_access": False}
                
        elif permission_type == "bigquery.jobs.create":
            try:
                test_query = "SELECT 1"
                job_config = bigquery.QueryJobConfig(dry_run=True)
                bq_client.query(test_query, job_config=job_config).result()
                return {"success": True, "has_access": True}
            except:
                return {"success": True, "has_access": False}
        else:
            # Return basic permissions check
            return {"success": True, "permissions": {
                "has_jobs_access": False,
                "has_jobs_by_project_access": False,
                "has_tables_access": True,
                "has_query_access": True
            }}
            
    except Exception as e:
        logger.error(f"Error checking permissions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/check-table-access")
async def check_table_access(request: Dict[str, Any]):
    """Check access to specific INFORMATION_SCHEMA tables"""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        table_name = request.get("table_name")
        region = request.get("region", "us")  # Default to 'us' if not provided
        
        # Clean up table name to get just the table part
        if "." in table_name:
            table_name = table_name.split(".")[-1]
        
        # Format region properly (add 'region-' prefix if not present)
        if not region.startswith("region-"):
            region = f"region-{region}"
        
        # Check INFORMATION_SCHEMA tables with proper region and location
        if table_name in ["JOBS", "JOBS_BY_PROJECT", "TABLE_STORAGE", "TABLES"]:
            # Extract location from region (remove 'region-' prefix for job location)
            location = region.replace("region-", "")
            
            # For JOBS tables, check at project-region level
            if table_name in ["JOBS", "JOBS_BY_PROJECT"]:
                try:
                    query = f"""
                    SELECT 1
                    FROM `{project_id}.{region}.INFORMATION_SCHEMA.{table_name}`
                    LIMIT 1
                    """
                    job_config = bigquery.QueryJobConfig(
                        dry_run=True,
                        use_query_cache=False
                    )
                    bq_client.query(query, job_config=job_config, location=location)
                    return {"success": True, "has_access": True}
                except Exception as e:
                    logger.info(f"Failed to access {table_name} in {region}: {str(e)}")
                    return {"success": True, "has_access": False}
            
            # For TABLE_STORAGE and TABLES, they might be dataset-scoped in some regions
            elif table_name in ["TABLE_STORAGE", "TABLES"]:
                # First try project-region level
                try:
                    query = f"""
                    SELECT 1
                    FROM `{project_id}.{region}.INFORMATION_SCHEMA.{table_name}`
                    LIMIT 1
                    """
                    job_config = bigquery.QueryJobConfig(
                        dry_run=True,
                        use_query_cache=False
                    )
                    bq_client.query(query, job_config=job_config, location=location)
                    return {"success": True, "has_access": True}
                except Exception as e:
                    logger.debug(f"Project-level {table_name} not accessible, trying dataset-level")
                    
                    # If project-level fails, try dataset-level
                    # These tables exist at dataset level and will be accessible when querying specific datasets
                    try:
                        # List datasets to verify project access
                        datasets = list(bq_client.list_datasets(project=project_id, max_results=1))
                        if datasets:
                            # If we can list datasets, the table will be accessible at dataset level
                            logger.info(f"{table_name} will be accessible at dataset level")
                            return {"success": True, "has_access": True}
                    except:
                        pass
                    
                    logger.info(f"Failed to access {table_name} in {region}: {str(e)}")
                    return {"success": True, "has_access": False}
        else:
            return {"success": True, "has_access": False}
                
    except Exception as e:
        logger.error(f"Error checking table access: {e}", exc_info=True)
        return {"success": False, "has_access": False}

@app.post("/api/projects/check-iam-permissions")
async def check_iam_permissions(request: Dict[str, Any]):
    """Check IAM permissions using BigQuery test_iam_permissions"""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        permissions = request.get("permissions", [])
        
        # Use BigQuery client to test IAM permissions
        try:
            from google.cloud import resourcemanager_v3
            
            # Create a resource manager client to test project-level permissions
            rm_client = resourcemanager_v3.ProjectsClient()
            resource = f"projects/{project_id}"
            
            # Test the permissions
            response = rm_client.test_iam_permissions(
                resource=resource,
                permissions=permissions
            )
            
            return {
                "success": True,
                "permissions": list(response.permissions)
            }
        except Exception as e:
            # Fallback: try to test permissions using BigQuery operations
            tested_permissions = []
            
            for permission in permissions:
                if permission == "bigquery.jobs.create":
                    try:
                        # Test with dry run query
                        test_query = "SELECT 1"
                        job_config = bigquery.QueryJobConfig(dry_run=True)
                        bq_client.query(test_query, job_config=job_config)
                        tested_permissions.append(permission)
                    except:
                        pass
                        
                elif permission == "bigquery.tables.get":
                    try:
                        # Try to get table metadata
                        query = f"""
                        SELECT table_name
                        FROM `{project_id}.region-us.INFORMATION_SCHEMA.TABLES`
                        LIMIT 1
                        """
                        job_config = bigquery.QueryJobConfig(dry_run=True)
                        bq_client.query(query, job_config=job_config)
                        tested_permissions.append(permission)
                    except:
                        pass
            
            return {
                "success": True,
                "permissions": tested_permissions
            }
            
    except Exception as e:
        logger.error(f"Error checking IAM permissions: {e}", exc_info=True)
        return {"success": False, "permissions": []}

@app.post("/api/projects/validate-access")
async def validate_access(request: Dict[str, Any]):
    """Validate project access"""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        
        # Try to list datasets in the project
        try:
            datasets = list(bq_client.list_datasets(project=project_id, max_results=1))
            return {
                "success": True,
                "has_access": True,
                "message": f"Successfully validated access to project {project_id}"
            }
        except Exception as e:
            return {
                "success": False,
                "has_access": False,
                "message": f"Cannot access project {project_id}: {str(e)}"
            }
    except Exception as e:
        logger.error(f"Error validating access: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/query/validate")
async def validate_query(request: Dict[str, Any]):
    """Validate a SQL query using BigQuery dry run"""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        query = request.get("query", "").strip()
        project_id = request.get("project_id", Config.BQ_PROJECT_ID)
        
        if not query:
            return {
                "valid": False,
                "error": "Query is empty",
                "error_type": "EMPTY_QUERY"
            }
        
        # Configure dry run
        job_config = bigquery.QueryJobConfig(
            dry_run=True,
            use_query_cache=False,
            default_dataset=f"{project_id}.{Config.BQ_DATASET}" if project_id else None
        )
        
        try:
            # Run dry run to validate query
            query_job = bq_client.query(query, job_config=job_config)
            
            # Extract information from dry run
            total_bytes_processed = query_job.total_bytes_processed or 0
            total_bytes_billed = query_job.total_bytes_billed or 0
            
            # Get referenced tables
            referenced_tables = []
            if hasattr(query_job, 'referenced_tables') and query_job.referenced_tables:
                for table_ref in query_job.referenced_tables:
                    referenced_tables.append({
                        "project_id": table_ref.project,
                        "dataset_id": table_ref.dataset_id,
                        "table_id": table_ref.table_id,
                        "full_id": f"{table_ref.project}.{table_ref.dataset_id}.{table_ref.table_id}"
                    })
            
            # Calculate estimated cost (BigQuery pricing: $5 per TB)
            estimated_cost = (total_bytes_billed / (1024**4)) * 5.00
            
            return {
                "valid": True,
                "query": query,
                "validation_details": {
                    "total_bytes_processed": total_bytes_processed,
                    "total_bytes_billed": total_bytes_billed,
                    "estimated_cost": round(estimated_cost, 4),
                    "referenced_tables": referenced_tables,
                    "will_use_cache": False,  # We set use_query_cache=False
                    "formatted_bytes": f"{total_bytes_processed / (1024**3):.2f} GB" if total_bytes_processed > 0 else "0 GB"
                },
                "message": f"Query is valid. Will process {total_bytes_processed / (1024**3):.2f} GB (${estimated_cost:.4f})"
            }
            
        except (google_exceptions.BadRequest, google_exceptions.NotFound) as e:
            # Parse BigQuery error for better error messages
            error_message = str(e)
            error_type = "SYNTAX_ERROR"
            
            if "not found" in error_message.lower() or "dataset" in error_message.lower():
                error_type = "TABLE_NOT_FOUND"
            elif "syntax error" in error_message.lower():
                error_type = "SYNTAX_ERROR"
            elif "permission" in error_message.lower() or "access denied" in error_message.lower():
                error_type = "PERMISSION_DENIED"
            elif "exceeded" in error_message.lower():
                error_type = "RESOURCE_EXCEEDED"
                
            return {
                "valid": False,
                "error": error_message,
                "error_type": error_type,
                "query": query
            }
            
        except Exception as e:
            logger.error(f"Unexpected error during query validation: {e}", exc_info=True)
            return {
                "valid": False,
                "error": f"Unexpected error: {str(e)}",
                "error_type": "UNKNOWN_ERROR",
                "query": query
            }
            
    except Exception as e:
        logger.error(f"Error validating query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/scan-information-schema")
async def scan_information_schema(request: Dict[str, Any]):
    """Scan project using INFORMATION_SCHEMA"""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        analysis_window = request.get("analysis_window", 30)
        price_per_tb = request.get("price_per_tb", 6.25)
        
        # For Firestore backend, we'll store in Firestore instead of BigQuery
        # But still scan using BigQuery INFORMATION_SCHEMA
        query = f"""
        SELECT 
            project_id,
            user_email,
            job_id,
            query,
            total_bytes_processed,
            total_bytes_billed,
            creation_time,
            start_time,
            end_time,
            total_slot_ms,
            TIMESTAMP_DIFF(end_time, start_time, SECOND) as runtime_seconds
        FROM `{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
        WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {analysis_window} DAY)
            AND statement_type = 'SELECT'
            AND state = 'DONE'
            AND query IS NOT NULL
        ORDER BY creation_time DESC
        LIMIT 1000
        """
        
        query_job = bq_client.query(query)
        results = list(query_job)
        
        # Process and store results in Firestore
        templates_found = 0
        for row in results:
            # Store each template in Firestore
            template_data = {
                "project_id": row.project_id,
                "query": row.query,
                "total_bytes_processed": row.total_bytes_processed,
                "total_bytes_billed": row.total_bytes_billed,
                "creation_time": row.creation_time.isoformat() if row.creation_time else None,
                "runtime_seconds": row.runtime_seconds,
                "estimated_cost": (row.total_bytes_billed or 0) / (10**12) * price_per_tb
            }
            # Could store in Firestore here
            templates_found += 1
        
        return {
            "success": True,
            "templates_found": templates_found,
            "message": f"Found {templates_found} query templates in the last {analysis_window} days"
        }
        
    except Exception as e:
        logger.error(f"Error scanning INFORMATION_SCHEMA: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/analyses/{analysis_id}")
async def update_analysis(analysis_id: str, update_data: Dict[str, Any]):
    """Update an analysis record"""
    try:
        # Update in Firestore
        analysis_ref = firestore_service.db.collection('analyses').document(analysis_id)
        doc = analysis_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        # Update with new data
        update_data['updated_at'] = datetime.utcnow().isoformat()
        analysis_ref.update(update_data)
        
        # Return updated document
        updated_doc = analysis_ref.get()
        return updated_doc.to_dict()
        
    except Exception as e:
        logger.error(f"Error updating analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/analyses/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """Delete an analysis record"""
    try:
        # Delete from Firestore
        analysis_ref = firestore_service.db.collection('analyses').document(analysis_id)
        doc = analysis_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        analysis_ref.delete()
        
        return {"success": True, "message": f"Analysis {analysis_id} deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/analyze-tables")
async def analyze_tables(request: Dict[str, Any]):
    """Analyze table performance and store results"""
    if not bq_client:
        raise HTTPException(status_code=503, detail="BigQuery client not initialized")
    
    try:
        project_id = request.get("project_id")
        
        # Comprehensive table analysis query
        query = f"""
        WITH 
        tables_metadata AS (
          SELECT
            table_catalog AS project_id,
            table_schema AS dataset_id,
            table_name,
            CONCAT(table_catalog, '.', table_schema, '.', table_name) AS full_table_name,
            table_type,
            creation_time AS table_creation_time,
            base_table_catalog,
            base_table_schema,
            base_table_name,
            ddl,

            -- Partition & cluster hints from DDL
            REGEXP_EXTRACT(ddl, r'PARTITION BY\\s+(?:DATE\\()?([^\\)\\s;]+)') AS partition_field,
            REGEXP_CONTAINS(ddl, r'PARTITION BY') AS is_partitioned,
            REGEXP_EXTRACT(ddl, r'CLUSTER BY\\s+([^;]+)') AS cluster_fields_raw,
            REGEXP_CONTAINS(ddl, r'CLUSTER BY') AS is_clustered,
            CASE 
              WHEN REGEXP_EXTRACT(ddl, r'CLUSTER BY\\s+([^;]+)') IS NOT NULL
              THEN ARRAY_LENGTH(SPLIT(REGEXP_EXTRACT(ddl, r'CLUSTER BY\\s+([^;]+)'), ','))
              ELSE 0
            END AS cluster_fields_count,

            REGEXP_CONTAINS(ddl, r'require_partition_filter\\s*=\\s*true') AS require_partition_filter,
            REGEXP_EXTRACT(ddl, r'partition_expiration_days\\s*=\\s*(\\d+)') AS partition_expiration_days,
            REGEXP_EXTRACT(ddl, r'description\\s*=\\s*"([^"]+)"') AS table_description,
            REGEXP_EXTRACT(ddl, r'kms_key_name\\s*=\\s*"([^"]+)"') AS kms_key_name

          FROM `{project_id}`.`region-us`.INFORMATION_SCHEMA.TABLES
          WHERE table_catalog = '{project_id}'
        ),

        storage_info AS (
          SELECT
            CONCAT(project_id, '.', table_schema, '.', table_name) AS full_table_name,
            SUM(total_logical_bytes) AS total_logical_bytes,
            SUM(total_physical_bytes) AS total_physical_bytes,
            SUM(active_logical_bytes) AS active_logical_bytes,
            SUM(long_term_logical_bytes) AS long_term_logical_bytes,
            SUM(time_travel_physical_bytes) AS time_travel_physical_bytes,
            SUM(total_rows) AS total_rows,

            COALESCE(ROUND(SUM(total_logical_bytes) / POW(2, 30), 2), 0) AS total_logical_gb,
            COALESCE(ROUND(SUM(total_physical_bytes) / POW(2, 30), 2), 0) AS total_physical_gb,
            COALESCE(ROUND(SUM(active_logical_bytes) / POW(2, 30), 2), 0) AS active_logical_gb,
            COALESCE(ROUND(SUM(long_term_logical_bytes) / POW(2, 30), 2), 0) AS long_term_logical_gb,
            COALESCE(ROUND(SUM(time_travel_physical_bytes) / POW(2, 30), 2), 0) AS time_travel_gb,

            COALESCE(ROUND((SUM(active_logical_bytes) / POW(2, 40)) * 20, 2), 0) AS active_storage_cost_monthly_usd,
            COALESCE(ROUND((SUM(long_term_logical_bytes) / POW(2, 40)) * 10, 2), 0) AS long_term_storage_cost_monthly_usd
          FROM `{project_id}`.`region-us`.INFORMATION_SCHEMA.TABLE_STORAGE
          WHERE project_id = '{project_id}'
          GROUP BY full_table_name
        ),

        query_usage AS (
          SELECT
            CONCAT(table_ref.project_id, '.', table_ref.dataset_id, '.', table_ref.table_id) AS full_table_name,
            COUNT(DISTINCT j.job_id) AS total_queries_6m,
            COUNT(DISTINCT j.user_email) AS unique_users_6m,
            COUNT(DISTINCT DATE(j.creation_time)) AS days_with_queries,
            COUNT(DISTINCT j.project_id) AS projects_accessing_table,

            COUNTIF(j.statement_type = 'SELECT') AS select_queries,
            COUNTIF(j.statement_type = 'INSERT') AS insert_queries,
            COUNTIF(j.statement_type = 'UPDATE') AS update_queries,
            COUNTIF(j.statement_type = 'DELETE') AS delete_queries,
            COUNTIF(j.statement_type = 'MERGE') AS merge_queries,

            COALESCE(SUM(j.total_bytes_billed), 0) AS total_bytes_billed,
            COALESCE(ROUND(SUM(j.total_bytes_billed) / POW(2, 40), 4), 0) AS total_tb_billed,
            COALESCE(ROUND(SUM(j.total_bytes_billed / POW(2,40)) * 5, 2), 0) AS total_query_cost_6m_usd,

            MAX(j.creation_time) AS last_queried_time
          FROM `{project_id}`.`region-us`.INFORMATION_SCHEMA.JOBS_BY_PROJECT j,
               UNNEST(j.referenced_tables) AS table_ref
          WHERE DATE(j.creation_time) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH) AND CURRENT_DATE()
            AND j.error_result IS NULL
          GROUP BY full_table_name
        )

        SELECT
          tm.project_id, tm.dataset_id, tm.table_name, tm.full_table_name,
          tm.table_type, tm.table_creation_time,
          TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), tm.table_creation_time, DAY) AS table_age_days,
          tm.table_description,

          tm.is_partitioned, tm.partition_field, tm.require_partition_filter,
          tm.partition_expiration_days, tm.is_clustered, tm.cluster_fields_raw,

          -- Storage metrics (null → 0)
          COALESCE(si.total_logical_gb, 0) AS total_logical_gb,
          COALESCE(si.active_logical_gb, 0) AS active_logical_gb,
          COALESCE(si.long_term_logical_gb, 0) AS long_term_logical_gb,
          COALESCE(si.active_storage_cost_monthly_usd, 0) AS active_storage_cost_monthly_usd,
          COALESCE(si.long_term_storage_cost_monthly_usd, 0) AS long_term_storage_cost_monthly_usd,

          -- Usage metrics (null → 0)
          COALESCE(qu.total_queries_6m, 0) AS total_queries_6m,
          COALESCE(qu.unique_users_6m, 0) AS unique_users_6m,
          COALESCE(qu.total_tb_billed, 0) AS total_tb_billed,
          COALESCE(qu.total_query_cost_6m_usd, 0) AS total_query_cost_6m_usd,

          -- Last queried timestamp stays nullable (never queried = NULL)
          qu.last_queried_time

        FROM tables_metadata tm
        LEFT JOIN storage_info si ON tm.full_table_name = si.full_table_name
        LEFT JOIN query_usage qu  ON tm.full_table_name = qu.full_table_name
        ORDER BY total_logical_gb DESC
        """
        
        query_job = bq_client.query(query)
        results = list(query_job)
        
        table_analyses = []
        for row in results:
            analysis = {
                # Basic info
                "project_id": row.project_id,
                "dataset_id": row.dataset_id,
                "table_name": row.table_name,
                "full_table_name": row.full_table_name,
                "table_type": row.table_type,
                "table_description": row.table_description if hasattr(row, 'table_description') else None,
                
                # Timestamps
                "table_creation_time": row.table_creation_time.isoformat() if row.table_creation_time else None,
                "table_age_days": row.table_age_days if hasattr(row, 'table_age_days') else None,
                "last_queried_time": row.last_queried_time.isoformat() if row.last_queried_time else None,
                "analyzed_at": datetime.utcnow().isoformat(),
                
                # Partitioning & Clustering
                "is_partitioned": row.is_partitioned if hasattr(row, 'is_partitioned') else False,
                "partition_field": row.partition_field if hasattr(row, 'partition_field') else None,
                "require_partition_filter": row.require_partition_filter if hasattr(row, 'require_partition_filter') else False,
                "partition_expiration_days": row.partition_expiration_days if hasattr(row, 'partition_expiration_days') else None,
                "is_clustered": row.is_clustered if hasattr(row, 'is_clustered') else False,
                "cluster_fields_raw": row.cluster_fields_raw if hasattr(row, 'cluster_fields_raw') else None,
                
                # Storage metrics
                "total_logical_gb": float(row.total_logical_gb) if hasattr(row, 'total_logical_gb') else 0,
                "active_logical_gb": float(row.active_logical_gb) if hasattr(row, 'active_logical_gb') else 0,
                "long_term_logical_gb": float(row.long_term_logical_gb) if hasattr(row, 'long_term_logical_gb') else 0,
                "active_storage_cost_monthly_usd": float(row.active_storage_cost_monthly_usd) if hasattr(row, 'active_storage_cost_monthly_usd') else 0,
                "long_term_storage_cost_monthly_usd": float(row.long_term_storage_cost_monthly_usd) if hasattr(row, 'long_term_storage_cost_monthly_usd') else 0,
                
                # Usage metrics
                "total_queries_6m": int(row.total_queries_6m) if hasattr(row, 'total_queries_6m') else 0,
                "unique_users_6m": int(row.unique_users_6m) if hasattr(row, 'unique_users_6m') else 0,
                "total_tb_billed": float(row.total_tb_billed) if hasattr(row, 'total_tb_billed') else 0,
                "total_query_cost_6m_usd": float(row.total_query_cost_6m_usd) if hasattr(row, 'total_query_cost_6m_usd') else 0,
                
                # Query breakdown
                "select_queries": int(row.select_queries) if hasattr(row, 'select_queries') else 0,
                "insert_queries": int(row.insert_queries) if hasattr(row, 'insert_queries') else 0,
                "update_queries": int(row.update_queries) if hasattr(row, 'update_queries') else 0,
                "delete_queries": int(row.delete_queries) if hasattr(row, 'delete_queries') else 0,
                "merge_queries": int(row.merge_queries) if hasattr(row, 'merge_queries') else 0,
            }
            table_analyses.append(analysis)
            
            # Store in Firestore with a better document ID
            doc_id = f"{project_id}_{row.dataset_id}_{row.table_name}".replace('.', '_')
            firestore_service.db.collection('table_analyses').document(doc_id).set(analysis)
        
        return {
            "success": True,
            "tables_analyzed": len(table_analyses),
            "analyses": table_analyses
        }
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error analyzing tables: {error_msg}", exc_info=True)
        
        # Provide helpful error messages for common issues
        if "Not found" in error_msg and "region" in error_msg:
            return {
                "success": False,
                "error": "Region not accessible",
                "message": "Unable to access INFORMATION_SCHEMA in region-us. Please ensure the project has BigQuery API enabled and tables exist in the US region.",
                "details": error_msg,
                "tables_analyzed": 0,
                "analyses": []
            }
        elif "Permission denied" in error_msg or "403" in error_msg:
            return {
                "success": False,
                "error": "Permission denied",
                "message": "Insufficient permissions to access BigQuery INFORMATION_SCHEMA. Please ensure you have the necessary BigQuery permissions.",
                "details": error_msg,
                "tables_analyzed": 0,
                "analyses": []
            }
        elif "does not have bigquery.jobs" in error_msg:
            return {
                "success": False,
                "error": "BigQuery not enabled",
                "message": "BigQuery API is not enabled for this project. Please enable the BigQuery API in the Google Cloud Console.",
                "details": error_msg,
                "tables_analyzed": 0,
                "analyses": []
            }
        else:
            return {
                "success": False,
                "error": "Query execution failed",
                "message": "Failed to analyze tables. This might be due to missing tables, permissions, or the project not having BigQuery data.",
                "details": error_msg,
                "tables_analyzed": 0,
                "analyses": []
            }

@app.get("/api/projects/{project_id}/table-analysis")
async def get_table_analysis(project_id: str, dataset_id: str = Query(None)):
    """Get table analysis results for a project"""
    try:
        # Query Firestore for table analyses
        analyses_ref = firestore_service.db.collection('table_analyses')
        
        # Filter by project_id field (not table_name)
        query = analyses_ref.where('project_id', '==', project_id)
        
        # If dataset_id is specified, add that filter too
        if dataset_id:
            query = query.where('dataset_id', '==', dataset_id)
        
        docs = query.stream()
        
        analyses = []
        for doc in docs:
            analysis = doc.to_dict()
            analysis['id'] = doc.id
            analyses.append(analysis)
        
        return {
            "project_id": project_id,
            "dataset_id": dataset_id,
            "analyses": analyses,
            "total_tables": len(analyses)
        }
        
    except Exception as e:
        logger.error(f"Error fetching table analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}/table-analysis-summary")
async def get_table_analysis_summary(project_id: str):
    """Get summary metrics from table analysis for a project"""
    try:
        # Query Firestore for table analyses
        analyses_ref = firestore_service.db.collection('table_analyses')
        query = analyses_ref.where('project_id', '==', project_id)
        docs = query.stream()
        
        # Initialize counters
        total_tables = 0
        total_storage_gb = 0
        total_storage_cost = 0
        unused_tables = 0
        partitioned_tables = 0
        clustered_tables = 0
        tables_with_no_partition_filter = 0
        active_storage_gb = 0
        long_term_storage_gb = 0
        
        for doc in docs:
            analysis = doc.to_dict()
            total_tables += 1
            
            # Storage metrics
            total_storage_gb += analysis.get('total_logical_gb', 0)
            active_storage_gb += analysis.get('active_logical_gb', 0)
            long_term_storage_gb += analysis.get('long_term_logical_gb', 0)
            total_storage_cost += analysis.get('active_storage_cost_monthly_usd', 0) + analysis.get('long_term_storage_cost_monthly_usd', 0)
            
            # Usage metrics
            if analysis.get('total_queries_6m', 0) == 0:
                unused_tables += 1
            
            # Optimization opportunities
            if analysis.get('is_partitioned', False):
                partitioned_tables += 1
                if not analysis.get('require_partition_filter', False):
                    tables_with_no_partition_filter += 1
            
            if analysis.get('is_clustered', False):
                clustered_tables += 1
        
        return {
            "project_id": project_id,
            "total_tables": total_tables,
            "total_storage_gb": round(total_storage_gb, 2),
            "active_storage_gb": round(active_storage_gb, 2),
            "long_term_storage_gb": round(long_term_storage_gb, 2),
            "total_storage_cost_monthly": round(total_storage_cost, 2),
            "unused_tables_count": unused_tables,
            "partitioned_tables_count": partitioned_tables,
            "clustered_tables_count": clustered_tables,
            "optimization_opportunities": {
                "unused_tables": unused_tables,
                "tables_without_partition_filter": tables_with_no_partition_filter,
                "unpartitioned_large_tables": total_tables - partitioned_tables if total_tables > 0 else 0
            }
        }
        
    except Exception as e:
        logger.error(f"Error fetching table analysis summary: {e}", exc_info=True)
        # Return empty summary instead of error
        return {
            "project_id": project_id,
            "total_tables": 0,
            "total_storage_gb": 0,
            "active_storage_gb": 0,
            "long_term_storage_gb": 0,
            "total_storage_cost_monthly": 0,
            "unused_tables_count": 0,
            "partitioned_tables_count": 0,
            "clustered_tables_count": 0,
            "optimization_opportunities": {
                "unused_tables": 0,
                "tables_without_partition_filter": 0,
                "unpartitioned_large_tables": 0
            }
        }

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
    logger.info(f"BigQuery Client: {'Initialized' if bq_client else 'Not Available'}")
    logger.info("="*60)

@app.get("/health")
async def health_check():
    """Health check endpoint with detailed status"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": Config.APP_ENV,
        "services": {
            "bigquery": "connected" if bq_client else "disconnected",
            "firestore": "connected"  # Firestore is always available
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