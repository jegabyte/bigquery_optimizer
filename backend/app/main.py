from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

from app.agent_pipeline import AgentPipeline
from app.models import QueryOptimizationRequest, QueryOptimizationResponse, AnalysisStatus
from app.auth import get_current_user, create_access_token
from app.rules import RulesetManager

load_dotenv()

app = FastAPI(
    title="BigQuery SQL Optimizer",
    description="Multi-Agent BigQuery SQL Optimization System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent_pipeline = AgentPipeline()
ruleset_manager = RulesetManager()

# In-memory storage for analysis results (in production, use a database)
analysis_storage = {}

@app.on_event("startup")
async def startup_event():
    await ruleset_manager.load_rules()

@app.get("/")
async def root():
    return {"message": "BigQuery SQL Optimizer API", "status": "healthy"}

@app.post("/api/optimize-query")
async def optimize_query(
    request: QueryOptimizationRequest,
    current_user: dict = Depends(get_current_user)
):
    try:
        # Generate unique analysis ID
        analysis_id = str(uuid.uuid4())
        print(f"DEBUG: Starting analysis with ID: {analysis_id}")
        print(f"DEBUG: Received query: {request.query}")
        print(f"DEBUG: Options: {request.options}")
        print(f"DEBUG: Current user: {current_user}")
        
        # Store initial status
        analysis_storage[analysis_id] = {
            "id": analysis_id,
            "status": "processing",
            "query": request.query,
            "options": request.options.dict(),
            "user": current_user,
            "created_at": datetime.utcnow().isoformat(),
            "result": None
        }
        
        # Get active rules
        rules = ruleset_manager.get_active_rules()
        print(f"DEBUG: Active rules count: {len(rules)}")
        
        result = await agent_pipeline.process_query(
            query=request.query,
            options=request.options,
            ruleset=rules
        )
        
        # Store the result
        analysis_storage[analysis_id]["status"] = "completed"
        analysis_storage[analysis_id]["result"] = result.dict()
        analysis_storage[analysis_id]["completed_at"] = datetime.utcnow().isoformat()
        
        print(f"DEBUG: Processing completed successfully for ID: {analysis_id}")
        
        # Return result with analysis ID
        return {
            "analysisId": analysis_id,
            **result.dict()
        }
    except Exception as e:
        print(f"ERROR: Failed to process query: {str(e)}")
        import traceback
        traceback.print_exc()
        
        if 'analysis_id' in locals():
            analysis_storage[analysis_id]["status"] = "failed"
            analysis_storage[analysis_id]["error"] = str(e)
        
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analysis/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    if analysis_id not in analysis_storage:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    return analysis_storage[analysis_id]

@app.get("/api/analysis/{analysis_id}/status")
async def get_analysis_status(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    if analysis_id not in analysis_storage:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    analysis = analysis_storage[analysis_id]
    return {
        "id": analysis_id,
        "status": analysis["status"],
        "created_at": analysis["created_at"],
        "completed_at": analysis.get("completed_at")
    }

@app.post("/api/auth/login")
async def login(credentials: Dict[str, str]):
    if credentials.get("email") == "demo@example.com" and credentials.get("password") == "demo":
        access_token = create_access_token(data={"sub": credentials["email"]})
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "email": credentials["email"],
                "name": "Demo User"
            }
        }
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials"
    )

@app.get("/api/projects")
async def get_projects(current_user: dict = Depends(get_current_user)):
    return [
        {"id": "1", "name": "Finance Queries", "queriesCount": 15, "lastModified": "2024-01-15"},
        {"id": "2", "name": "Marketing Analytics", "queriesCount": 8, "lastModified": "2024-01-14"},
        {"id": "3", "name": "Sales Reports", "queriesCount": 23, "lastModified": "2024-01-13"}
    ]

@app.get("/api/query-history")
async def get_query_history(current_user: dict = Depends(get_current_user)):
    return [
        {
            "id": "1",
            "query": "SELECT * FROM sales_data",
            "timestamp": "2024-01-15T10:30:00",
            "projectName": "Finance Queries",
            "issues": 2,
            "costSavings": 0.65
        },
        {
            "id": "2",
            "query": "SELECT user_id, COUNT(*) FROM events GROUP BY user_id",
            "timestamp": "2024-01-14T15:45:00",
            "projectName": "Marketing Analytics",
            "issues": 0,
            "costSavings": 0
        }
    ]

@app.post("/api/admin/rules/reload")
async def reload_rules(current_user: dict = Depends(get_current_user)):
    try:
        await ruleset_manager.load_rules()
        return {"message": "Rules reloaded successfully", "version": ruleset_manager.version}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/storage-insights")
async def get_storage_insights(current_user: dict = Depends(get_current_user)):
    return {
        "tables": [
            {
                "name": "sales_data",
                "size": "1.2 TB",
                "partitioned": False,
                "clustered": False,
                "recommendation": "Add partitioning on date column"
            },
            {
                "name": "user_events",
                "size": "800 GB",
                "partitioned": True,
                "clustered": False,
                "recommendation": "Add clustering on user_id"
            }
        ],
        "totalSize": "2.5 TB",
        "potentialSavings": "40%"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)