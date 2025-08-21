"""
FastAPI Backend with IAP Authentication Support
"""

import os
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from typing import Optional

# Import existing main_firestore functionality
from main_firestore import (
    app as base_app,
    router as base_router,
    Project,
    Analysis,
    QueryTemplate,
    TableAnalysis,
    get_project_data,
    save_project,
    update_project,
    delete_project,
    save_analysis,
    get_analyses,
    analyze_project_queries,
    get_template_by_id,
    save_template,
    get_templates,
    delete_template,
    update_template,
    save_table_analysis,
    get_table_analyses
)

# Import IAP auth
from iap_auth import iap_auth, get_current_user_email

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create new app with IAP support
app = FastAPI(title="BigQuery Optimizer Backend API with IAP")

# Check if IAP is enabled
IAP_ENABLED = os.getenv("IAP_ENABLED", "false").lower() == "true"
IAP_AUDIENCE = os.getenv("IAP_AUDIENCE", "")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Auth endpoint for IAP
@app.get("/api/auth/me")
async def get_current_user(request: Request):
    """Get current user from IAP token"""
    if not IAP_ENABLED:
        return {"email": "local-user@example.com", "name": "Local User"}
    
    try:
        # Check for IAP header
        iap_jwt = request.headers.get("X-Goog-IAP-JWT-Assertion")
        if not iap_jwt:
            raise HTTPException(status_code=401, detail="Missing IAP authentication")
        
        # Verify token
        claims = iap_auth.verify_token(iap_jwt)
        return {
            "email": claims.get("email"),
            "name": claims.get("name", claims.get("email")),
            "sub": claims.get("sub")
        }
    except Exception as e:
        logger.error(f"IAP auth failed: {e}")
        raise HTTPException(status_code=401, detail=str(e))


# Wrap existing endpoints with optional IAP auth
def get_user_email(request: Request) -> Optional[str]:
    """Extract user email from IAP token if enabled"""
    if not IAP_ENABLED:
        return "local-user@example.com"
    
    try:
        iap_jwt = request.headers.get("X-Goog-IAP-JWT-Assertion")
        if iap_jwt:
            claims = iap_auth.verify_token(iap_jwt)
            return claims.get("email")
    except Exception:
        pass
    return None


# Projects endpoints with IAP
@app.get("/api/projects")
async def get_projects_iap(request: Request):
    user_email = get_user_email(request)
    # Could filter by user_email if needed
    projects = await get_project_data()
    return projects


@app.post("/api/projects")
async def save_project_iap(project: Project, request: Request):
    user_email = get_user_email(request)
    # Add user_email to project if needed
    project_dict = project.dict()
    if user_email:
        project_dict["created_by"] = user_email
    return await save_project(Project(**project_dict))


@app.get("/api/projects/{project_id}")
async def get_project_iap(project_id: str, request: Request):
    user_email = get_user_email(request)
    projects = await get_project_data()
    for project in projects:
        if project["project_id"] == project_id:
            return project
    raise HTTPException(status_code=404, detail="Project not found")


@app.put("/api/projects/{project_id}")
async def update_project_iap(project_id: str, project: Project, request: Request):
    user_email = get_user_email(request)
    project_dict = project.dict()
    if user_email:
        project_dict["updated_by"] = user_email
    return await update_project(project_id, Project(**project_dict))


@app.delete("/api/projects/{project_id}")
async def delete_project_iap(project_id: str, request: Request):
    user_email = get_user_email(request)
    # Could check ownership if needed
    return await delete_project(project_id)


# Analysis endpoints with IAP
@app.post("/api/analyses")
async def save_analysis_iap(analysis: Analysis, request: Request):
    user_email = get_user_email(request)
    analysis_dict = analysis.dict()
    if user_email:
        analysis_dict["analyzed_by"] = user_email
    return await save_analysis(Analysis(**analysis_dict))


@app.get("/api/analyses/{project_id}")
async def get_analyses_iap(project_id: str, request: Request):
    user_email = get_user_email(request)
    return await get_analyses(project_id)


# Templates endpoints with IAP
@app.get("/api/templates")
async def get_templates_iap(request: Request):
    user_email = get_user_email(request)
    return await get_templates()


@app.get("/api/templates/{template_id}")
async def get_template_iap(template_id: str, request: Request):
    user_email = get_user_email(request)
    return await get_template_by_id(template_id)


@app.post("/api/templates")
async def save_template_iap(template: QueryTemplate, request: Request):
    user_email = get_user_email(request)
    template_dict = template.dict()
    if user_email:
        template_dict["created_by"] = user_email
    return await save_template(QueryTemplate(**template_dict))


@app.put("/api/templates/{template_id}")
async def update_template_iap(template_id: str, template: QueryTemplate, request: Request):
    user_email = get_user_email(request)
    template_dict = template.dict()
    if user_email:
        template_dict["updated_by"] = user_email
    return await update_template(template_id, QueryTemplate(**template_dict))


@app.delete("/api/templates/{template_id}")
async def delete_template_iap(template_id: str, request: Request):
    user_email = get_user_email(request)
    return await delete_template(template_id)


# Table analysis endpoints with IAP
@app.post("/api/table-analyses")
async def save_table_analysis_iap(analysis: TableAnalysis, request: Request):
    user_email = get_user_email(request)
    analysis_dict = analysis.dict()
    if user_email:
        analysis_dict["analyzed_by"] = user_email
    return await save_table_analysis(TableAnalysis(**analysis_dict))


@app.get("/api/table-analyses/{project_id}")
async def get_table_analyses_iap(project_id: str, request: Request):
    user_email = get_user_email(request)
    return await get_table_analyses(project_id)


# Analyze project endpoint with IAP
@app.post("/api/projects/{project_id}/analyze")
async def analyze_project_iap(project_id: str, request: Request):
    user_email = get_user_email(request)
    return await analyze_project_queries(project_id)


# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "iap_enabled": IAP_ENABLED,
        "iap_configured": bool(IAP_AUDIENCE) if IAP_ENABLED else None
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("BACKEND_API_PORT", 8001))
    
    if IAP_ENABLED:
        logger.info(f"Starting Backend API with IAP authentication on port {port}")
        logger.info(f"IAP Audience: {IAP_AUDIENCE[:20]}..." if IAP_AUDIENCE else "IAP Audience not set!")
    else:
        logger.info(f"Starting Backend API without IAP (local mode) on port {port}")
    
    uvicorn.run(app, host="0.0.0.0", port=port)