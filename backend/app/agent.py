"""
BigQuery Optimizer Agent - Vertex AI Only Implementation
Requires Vertex AI to be properly configured
"""

import os
import json
import asyncio
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import logging
from datetime import datetime

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
USE_VERTEX = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "True").lower() == "true"
BIGQUERY_DATASET = os.getenv("BIGQUERY_DATASET", "analytics")

# Track service status
SERVICE_STATUS = {
    "vertex_ai": "unknown",
    "bigquery": "unknown", 
    "last_check": None,
    "errors": []
}

# Try to initialize Google genai client
GENAI_CLIENT = None
GENAI_ERROR = None

if USE_VERTEX:
    try:
        from google import genai
        from google.genai import types
        
        # Try to create Vertex AI client
        GENAI_CLIENT = genai.Client(
            vertexai=True,
            project=PROJECT_ID,
            location="us-central1"
        )
        SERVICE_STATUS["vertex_ai"] = "initialized"
        logger.info(f"✓ Vertex AI client initialized for project: {PROJECT_ID}")
        
    except Exception as e:
        GENAI_ERROR = str(e)
        SERVICE_STATUS["vertex_ai"] = "initialization_failed"
        SERVICE_STATUS["errors"].append({
            "service": "vertex_ai_init",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        })
        logger.error(f"❌ Vertex AI initialization failed: {e}")
else:
    GENAI_ERROR = "Vertex AI is disabled in configuration"
    SERVICE_STATUS["vertex_ai"] = "disabled"
    logger.warning("⚠️ Vertex AI is disabled. Set GOOGLE_GENAI_USE_VERTEXAI=True to enable")


class QueryOptimizationRequest(BaseModel):
    """Input schema for query optimization"""
    query: str = Field(description="The BigQuery SQL query to optimize")
    project_id: Optional[str] = Field(default=PROJECT_ID, description="GCP project ID")
    dataset_id: Optional[str] = Field(default=BIGQUERY_DATASET, description="BigQuery dataset ID")
    validate: bool = Field(default=True, description="Whether to validate the optimization")


class OptimizationIssue(BaseModel):
    """Schema for optimization issues"""
    type: str
    severity: str  # critical, high, medium, low
    description: str
    impact: Optional[str] = None
    fix_suggestion: Optional[str] = None


class OptimizationResult(BaseModel):
    """Output schema for query optimization"""
    original_query: str
    optimized_query: str
    issues: List[OptimizationIssue]
    suggestions: List[str]
    validation_result: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    """Error response schema"""
    error: str
    message: str
    details: Dict[str, Any]
    suggestions: List[str]


async def optimize_with_vertex_ai(request: QueryOptimizationRequest) -> OptimizationResult:
    """
    Optimize using Vertex AI/Gemini
    Raises exception if it fails - no fallback
    """
    if not GENAI_CLIENT:
        error_msg = "Vertex AI client is not initialized"
        logger.error(error_msg)
        
        if GENAI_ERROR:
            error_msg = f"{error_msg}: {GENAI_ERROR}"
        
        raise RuntimeError(error_msg)
    
    # Create optimization prompt
    prompt = f"""
    You are a BigQuery SQL optimization expert. Analyze the following query and provide optimization recommendations.
    
    Query to optimize:
    ```sql
    {request.query}
    ```
    
    Project: {request.project_id}
    Dataset: {request.dataset_id}
    
    Analyze the query for these common issues:
    1. SELECT * usage (specify columns instead)
    2. Missing partition filters (add WHERE clause on partition columns like _PARTITIONTIME or date)
    3. Missing LIMIT clause with ORDER BY
    4. Inefficient JOINs (CROSS JOIN, missing ON conditions)
    5. Subqueries that could be CTEs
    6. Missing clustering benefits
    7. Unnecessary DISTINCT operations
    8. Functions on columns in WHERE clause (non-sargable)
    
    Provide your response in this exact JSON format:
    {{
        "issues": [
            {{
                "type": "ISSUE_TYPE",
                "severity": "critical|high|medium|low",
                "description": "Clear description of the issue",
                "impact": "Performance/cost impact",
                "fix_suggestion": "How to fix it"
            }}
        ],
        "optimized_query": "The complete optimized SQL query",
        "suggestions": ["Additional optimization tip 1", "Additional optimization tip 2"],
        "estimated_improvement": "Estimated performance improvement percentage"
    }}
    
    Make sure to provide a complete, valid SQL query in optimized_query.
    """
    
    logger.info("Sending request to Vertex AI...")
    
    try:
        # Use Gemini to analyze the query
        response = await GENAI_CLIENT.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                top_p=0.95,
                max_output_tokens=4096,
                response_mime_type="application/json"
            )
        )
        
        logger.info("✓ Received response from Vertex AI")
        
        # Parse the response
        result_data = json.loads(response.text)
        
        # Create optimization result
        issues = [
            OptimizationIssue(
                type=issue.get('type', 'UNKNOWN'),
                severity=issue.get('severity', 'medium'),
                description=issue.get('description', ''),
                impact=issue.get('impact'),
                fix_suggestion=issue.get('fix_suggestion')
            )
            for issue in result_data.get('issues', [])
        ]
        
        # Get validation result if requested
        validation_result = None
        if request.validate:
            validation_result = await estimate_cost_savings(
                request.query, 
                result_data.get('optimized_query', request.query)
            )
        
        SERVICE_STATUS["vertex_ai"] = "working"
        SERVICE_STATUS["last_check"] = datetime.now().isoformat()
        
        return OptimizationResult(
            original_query=request.query,
            optimized_query=result_data.get('optimized_query', request.query),
            issues=issues,
            suggestions=result_data.get('suggestions', []),
            validation_result=validation_result,
            metadata={
                'estimated_improvement': result_data.get('estimated_improvement', 'Unknown'),
                'project_id': request.project_id,
                'dataset_id': request.dataset_id,
                'timestamp': datetime.now().isoformat(),
                'service': 'vertex_ai'
            }
        )
        
    except Exception as e:
        error_msg = f"Vertex AI optimization failed: {e}"
        logger.error(error_msg)
        
        SERVICE_STATUS["vertex_ai"] = "error"
        SERVICE_STATUS["errors"].append({
            "service": "vertex_ai",
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "query_preview": request.query[:100]
        })
        
        # Check for specific error types
        error_str = str(e).lower()
        
        if "404" in error_str or "not found" in error_str:
            raise RuntimeError(
                "Vertex AI endpoint not found. "
                "The Gemini model may not be available in your region or project. "
                "Please check: 1) Vertex AI API is enabled, "
                "2) Your project has access to Gemini models, "
                "3) The region 'us-central1' supports Gemini"
            )
        elif "403" in error_str or "permission" in error_str:
            raise RuntimeError(
                "Permission denied for Vertex AI. "
                "Please check: 1) Your service account has Vertex AI permissions, "
                "2) The Vertex AI API is enabled for your project"
            )
        elif "quota" in error_str:
            raise RuntimeError(
                "Vertex AI quota exceeded. "
                "Please check your Vertex AI quotas in the Google Cloud Console"
            )
        else:
            raise RuntimeError(f"Vertex AI error: {e}")


async def estimate_cost_savings(original_query: str, optimized_query: str) -> Dict[str, Any]:
    """
    Try to estimate cost savings using BigQuery dry-run
    """
    try:
        from app.tools.bigquery_tools import get_bigquery_client
        
        client = get_bigquery_client()
        
        # Dry run both queries
        original_result = client.dry_run_query(original_query)
        optimized_result = client.dry_run_query(optimized_query)
        
        # Calculate savings
        original_cost = original_result.get('estimated_cost_usd', 0)
        optimized_cost = optimized_result.get('estimated_cost_usd', 0)
        
        if original_cost > 0:
            savings_pct = ((original_cost - optimized_cost) / original_cost) * 100
        else:
            savings_pct = 0
        
        SERVICE_STATUS["bigquery"] = "working"
        
        return {
            'original_cost': original_cost,
            'optimized_cost': optimized_cost,
            'cost_savings': round(savings_pct, 1),
            'bytes_processed_original': original_result.get('bytes_processed', 0),
            'bytes_processed_optimized': optimized_result.get('bytes_processed', 0),
            'estimated_rows_original': original_result.get('bytes_processed', 0) // 100,
            'estimated_rows_optimized': optimized_result.get('bytes_processed', 0) // 100,
            'source': 'bigquery_dryrun'
        }
        
    except Exception as e:
        logger.warning(f"BigQuery dry-run failed: {e}")
        SERVICE_STATUS["bigquery"] = "error"
        
        # Return None if BigQuery fails
        return None


async def optimize_query(request: QueryOptimizationRequest) -> OptimizationResult:
    """
    Main optimization function - uses Vertex AI only
    Raises exception if Vertex AI is not available
    """
    logger.info(f"=== Starting query optimization ===")
    logger.info(f"Project: {request.project_id}, Dataset: {request.dataset_id}")
    logger.info(f"Query preview: {request.query[:100]}...")
    
    if not USE_VERTEX:
        raise RuntimeError(
            "Vertex AI is disabled. Set GOOGLE_GENAI_USE_VERTEXAI=True in .env to enable optimization"
        )
    
    if not GENAI_CLIENT:
        raise RuntimeError(
            f"Vertex AI client not available. {GENAI_ERROR or 'Please check your configuration'}"
        )
    
    # Use Vertex AI (no fallback)
    result = await optimize_with_vertex_ai(request)
    logger.info("✓ Successfully optimized with Vertex AI")
    
    return result


# Main handler for ADK
async def handle_request(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main handler function that ADK will call
    Returns error response if Vertex AI is not available
    """
    logger.info(f"=== ADK Request Received ===")
    logger.info(f"Request keys: {list(request.keys())}")
    
    try:
        # Extract query from different possible locations
        query = request.get('query') or request.get('input', {}).get('query')
        
        if not query:
            logger.error("No query found in request")
            return ErrorResponse(
                error='invalid_request',
                message='No query provided',
                details={
                    'request_keys': list(request.keys()),
                    'expected': 'query field with SQL query'
                },
                suggestions=[
                    'Include a "query" field with your BigQuery SQL',
                    'Example: {"query": "SELECT * FROM table"}'
                ]
            ).model_dump()
        
        # Create optimization request
        opt_request = QueryOptimizationRequest(
            query=query,
            project_id=request.get('project_id') or request.get('input', {}).get('project_id', PROJECT_ID),
            dataset_id=request.get('dataset_id') or request.get('input', {}).get('dataset_id', BIGQUERY_DATASET),
            validate=request.get('validate', request.get('input', {}).get('validate', True))
        )
        
        # Optimize the query
        result = await optimize_query(opt_request)
        
        # Convert to dict and return
        response = result.model_dump()
        logger.info(f"=== Optimization Complete ===")
        logger.info(f"Issues found: {len(result.issues)}")
        
        return response
        
    except RuntimeError as e:
        # Vertex AI not available - return clear error
        logger.error(f"Service error: {e}")
        
        error_msg = str(e)
        
        # Provide specific suggestions based on error
        suggestions = []
        if "404" in error_msg or "not found" in error_msg:
            suggestions = [
                "Enable Vertex AI API: gcloud services enable aiplatform.googleapis.com",
                "Check if Gemini models are available in your region",
                "Try changing the region in backend/.env (e.g., us-east1, europe-west4)"
            ]
        elif "permission" in error_msg:
            suggestions = [
                "Grant Vertex AI permissions to your service account",
                "Run: gcloud auth application-default login",
                "Ensure your account has Vertex AI User role"
            ]
        elif "disabled" in error_msg:
            suggestions = [
                "Set GOOGLE_GENAI_USE_VERTEXAI=True in backend/.env",
                "Restart the backend server after changing configuration"
            ]
        else:
            suggestions = [
                "Check Google Cloud Console for Vertex AI status",
                "Verify your project has billing enabled",
                "Ensure Application Default Credentials are configured"
            ]
        
        return ErrorResponse(
            error='service_unavailable',
            message=error_msg,
            details={
                'service_status': SERVICE_STATUS,
                'project': PROJECT_ID,
                'timestamp': datetime.now().isoformat()
            },
            suggestions=suggestions
        ).model_dump()
        
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        
        return ErrorResponse(
            error='internal_error',
            message=f"An unexpected error occurred: {str(e)}",
            details={
                'error_type': type(e).__name__,
                'service_status': SERVICE_STATUS,
                'timestamp': datetime.now().isoformat()
            },
            suggestions=[
                "Check the backend logs for more details",
                "Verify your Google Cloud configuration",
                "Contact support if the issue persists"
            ]
        ).model_dump()


# Status endpoint for debugging
async def get_status() -> Dict[str, Any]:
    """
    Get current service status for debugging
    """
    return {
        "status": "requires_vertex_ai",
        "services": SERVICE_STATUS,
        "config": {
            "project_id": PROJECT_ID,
            "use_vertex": USE_VERTEX,
            "dataset": BIGQUERY_DATASET,
            "genai_client": GENAI_CLIENT is not None
        },
        "requirements": {
            "vertex_ai": "Required - No fallback available",
            "apis_needed": [
                "aiplatform.googleapis.com",
                "bigquery.googleapis.com"
            ],
            "configuration": {
                "GOOGLE_CLOUD_PROJECT": PROJECT_ID,
                "GOOGLE_GENAI_USE_VERTEXAI": "Must be True",
                "Application Default Credentials": "Must be configured"
            }
        },
        "timestamp": datetime.now().isoformat()
    }


# Create an ADK agent
try:
    from google.adk.agents import LlmAgent
    from google.genai import types
    
    # Create a simple LLM agent that processes queries
    root_agent = LlmAgent(
        model="gemini-2.5-flash",
        system_instruction="""You are a BigQuery SQL Optimizer. 
        When given a query, analyze it and provide optimization suggestions.
        Parse any JSON input to extract the query field.
        Respond with optimization tips and an improved query if applicable.""",
    )
    
except Exception as e:
    print(f"Warning: Could not create ADK agent: {e}")
    # Fallback - use the function directly
    root_agent = handle_request
    
agent = root_agent  # Keep for backwards compatibility

# For direct testing
if __name__ == "__main__":
    # Test the agent directly
    test_query = "SELECT * FROM analytics.events"
    
    async def test():
        request = {
            "query": test_query,
            "project_id": PROJECT_ID
        }
        result = await handle_request(request)
        print(json.dumps(result, indent=2))
    
    asyncio.run(test())