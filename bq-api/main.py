"""
BigQuery API Service for Projects & Jobs
Separate FastAPI backend for handling BigQuery operations
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import hashlib
import re
import json
import os
from pydantic import BaseModel

# Initialize FastAPI app
app = FastAPI(
    title="BigQuery Optimizer API",
    description="API for managing BigQuery optimization projects and templates",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    
    # Set the default project for bq_optimizer dataset
    BQ_PROJECT = os.getenv('BQ_PROJECT_ID', 'aiva-e74f3')
    BQ_DATASET = 'bq_optimizer'
    
except Exception as e:
    print(f"Warning: Could not initialize BigQuery client: {e}")
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
            
            return {
                "success": True,
                "message": "Project updated",
                "project": config.dict(),
                "scan_result": scan_result
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
        
        return {
            "success": True,
            "project": config.dict(),
            "scan_result": scan_result
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)