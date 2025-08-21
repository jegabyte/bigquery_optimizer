"""
BigQuery API Service with Firestore Storage
FastAPI backend using Firestore for data persistence
"""

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import hashlib
import re
import json
import os
import time
import logging
from pydantic import BaseModel
from firestore_service import firestore_service
from firestore_templates import TemplateFirestoreManager

# Initialize template manager
template_manager = TemplateFirestoreManager()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="BigQuery Optimizer API with Firestore",
    description="API for managing BigQuery optimization projects with Firestore storage",
    version="2.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    
    BQ_PROJECT = os.getenv('BQ_PROJECT_ID', 'aiva-e74f3')
    
except Exception as e:
    print(f"Warning: Could not initialize BigQuery client: {e}")
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
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyses")
async def save_analysis(analysis: AnalysisResult):
    """Save an analysis result to Firestore"""
    try:
        # Prepare analysis data
        analysis_data = {
            "query": analysis.query,
            "options": analysis.options or {},
            "result": analysis.result,
            "stage_data": analysis.stage_data or {},
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
        raise HTTPException(status_code=500, detail=str(e))

# Rules Management Endpoints
@app.get("/api/rules")
async def get_all_rules():
    """Get all BigQuery anti-pattern rules from Firestore"""
    try:
        rules = []
        # Use the db directly from firestore module
        from google.cloud import firestore as fs
        db = fs.Client(project='aiva-e74f3')
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
        db = fs.Client(project='aiva-e74f3')
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
        db = fs.Client(project='aiva-e74f3')
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
        db = fs.Client(project='aiva-e74f3')
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
        db = fs.Client(project='aiva-e74f3')
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
        db = fs.Client(project='aiva-e74f3')
        doc_ref = db.collection('bq_anti_pattern_rules').document(rule_id)
        
        if not doc_ref.get().exists:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        doc_ref.delete()
        return {"success": True, "message": f"Rule {rule_id} deleted"}
    except Exception as e:
        logger.error(f"Error deleting rule {rule_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)