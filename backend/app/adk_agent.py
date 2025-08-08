"""
BigQuery Optimizer ADK Agent
Vertex AI-only implementation following gemini-fullstack pattern
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Literal
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent, LlmAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.adk.tools import FunctionTool
from google.genai import types as genai_types
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")


# Structured Output Models
class OptimizationAnalysis(BaseModel):
    """Model for query optimization analysis"""
    has_select_star: bool = Field(description="Whether query uses SELECT *")
    has_where_clause: bool = Field(description="Whether query has WHERE clause")
    has_limit: bool = Field(description="Whether query has LIMIT clause")
    has_subqueries: bool = Field(description="Whether query contains subqueries")
    has_joins: bool = Field(description="Whether query contains JOIN operations")
    complexity: Literal["low", "medium", "high"] = Field(description="Query complexity level")
    issues: list[str] = Field(description="List of optimization issues found")

class OptimizationResult(BaseModel):
    """Model for optimization results"""
    optimized_query: str = Field(description="The optimized SQL query")
    suggestions: list[str] = Field(description="List of optimization suggestions")
    estimated_improvement: str = Field(description="Estimated performance improvement")

def optimize_query_function(query_input: str) -> Dict[str, Any]:
    """Analyzes and optimizes a BigQuery SQL query.
    
    Args:
        query_input: Either a SQL query string or JSON with query and metadata
        
    Returns:
        Dict containing optimized query and suggestions
    """
    try:
        # Parse input if it's JSON
        if query_input.startswith('{'):
            try:
                data = json.loads(query_input)
                actual_query = data.get('query', query_input)
                project_id = data.get('project_id', PROJECT_ID)
                dataset_id = data.get('dataset_id', 'analytics')
            except json.JSONDecodeError:
                actual_query = query_input
                project_id = PROJECT_ID
                dataset_id = 'analytics'
        else:
            actual_query = query_input
            project_id = PROJECT_ID
            dataset_id = 'analytics'
        
        # Analyze the query
        analysis = analyze_query(actual_query)
        
        # Generate optimization suggestions
        suggestions = generate_suggestions(analysis)
        
        # Create optimized query
        optimized_query = optimize_query_logic(actual_query, analysis)
        
        result = {
            "original_query": actual_query,
            "optimized_query": optimized_query,
            "analysis": analysis,
            "suggestions": suggestions,
            "project_id": project_id,
            "dataset_id": dataset_id,
            "timestamp": datetime.now().isoformat()
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Query optimization failed: {e}")
        return {
            "error": str(e),
            "original_query": query_input,
            "suggestions": ["Error occurred during optimization"],
            "timestamp": datetime.now().isoformat()
        }


def analyze_query(query: str) -> Dict[str, Any]:
    """Analyze query for optimization opportunities"""
    query_upper = query.upper()
    
    analysis = {
        "has_select_star": "SELECT *" in query_upper,
        "has_subqueries": "SELECT" in query_upper and query_upper.count("SELECT") > 1,
        "has_joins": "JOIN" in query_upper,
        "has_where_clause": "WHERE" in query_upper,
        "has_group_by": "GROUP BY" in query_upper,
        "has_order_by": "ORDER BY" in query_upper,
        "has_limit": "LIMIT" in query_upper,
        "estimated_complexity": "low"
    }
    
    # Estimate complexity
    complexity_score = sum([
        analysis["has_subqueries"] * 2,
        analysis["has_joins"] * 2,
        analysis["has_group_by"],
        not analysis["has_where_clause"],
        not analysis["has_limit"]
    ])
    
    if complexity_score >= 4:
        analysis["estimated_complexity"] = "high"
    elif complexity_score >= 2:
        analysis["estimated_complexity"] = "medium"
        
    return analysis


def generate_suggestions(analysis: Dict[str, Any]) -> list:
    """Generate optimization suggestions based on analysis"""
    suggestions = []
    
    if analysis["has_select_star"]:
        suggestions.append("Avoid SELECT * - specify only required columns to reduce data transfer")
        
    if not analysis["has_where_clause"] and not analysis["has_limit"]:
        suggestions.append("Add WHERE clause or LIMIT to reduce data scanned")
        
    if analysis["has_subqueries"]:
        suggestions.append("Consider using CTEs (WITH clause) instead of nested subqueries for better readability")
        
    if analysis["has_joins"] and not analysis["has_where_clause"]:
        suggestions.append("Add WHERE clauses before joins to reduce join complexity")
        
    if not analysis["has_limit"] and analysis["has_order_by"]:
        suggestions.append("Consider adding LIMIT when using ORDER BY to improve performance")
        
    if analysis["estimated_complexity"] == "high":
        suggestions.append("Consider breaking this complex query into smaller parts or using materialized views")
        
    if not suggestions:
        suggestions.append("Query appears to be well-optimized")
        
    return suggestions


def optimize_query_logic(query: str, analysis: Dict[str, Any]) -> str:
    """Generate an optimized version of the query"""
    optimized = query
    
    # Add LIMIT if missing and no aggregation
    if not analysis["has_limit"] and not analysis["has_group_by"]:
        if not optimized.rstrip().endswith(';'):
            optimized += "\nLIMIT 1000"
        else:
            optimized = optimized.rstrip(';') + "\nLIMIT 1000;"
            
    # Note: In a real implementation, you would use a proper SQL parser
    # to safely modify the query structure
    
    return optimized


# Create the optimizer tool
optimizer_tool = FunctionTool(
    func=optimize_query_function
)

# Create the main optimizer agent using Vertex AI
try:
    # Following the gemini-fullstack pattern
    bigquery_optimizer = LlmAgent(
        model="gemini-2.5-flash",
        name="bigquery_optimizer",
        description="Analyzes and optimizes BigQuery SQL queries using Vertex AI",
        instruction=f"""
        You are a BigQuery SQL optimization expert. When you receive a message:

        1. First, check if it contains a SQL query or a JSON object with a query field
        2. Extract the query from the message - it might be in JSON format like {{"query": "SELECT...", "project_id": "..."}}
        3. Use the optimize_query tool to analyze and optimize the query
        4. Present the results in a clear, structured format

        Always be helpful and provide actionable optimization suggestions.
        If the input doesn't contain a valid query, ask the user to provide one.

        When presenting results:
        - Show the original query
        - Show the optimized query (if different)
        - List key optimization suggestions
        - Explain the performance impact

        Remember to parse JSON inputs properly to extract the query field.
        
        Current date: {datetime.now().strftime("%Y-%m-%d")}
        Project ID: {PROJECT_ID}
        Location: {LOCATION}
        """,
        tools=[optimizer_tool],
    )
    
    # Create the root agent
    root_agent = bigquery_optimizer
    logger.info(f"✓ Created BigQuery optimizer agent with Vertex AI (model: gemini-2.5-flash)")
    
except Exception as e:
    logger.error(f"Failed to create LLM agent with Vertex AI: {e}")
    
    # Create a custom fallback agent that follows the BaseAgent pattern
    class VertexAIRequiredAgent(BaseAgent):
        """Agent that requires Vertex AI to be configured"""
        
        def __init__(self):
            super().__init__(name="bigquery_optimizer_vertex_required")
        
        async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
            """Return error message about Vertex AI requirement"""
            error_msg = f"""
## Vertex AI Configuration Required

The BigQuery Optimizer requires Vertex AI to be properly configured.

**Error:** {str(e)}

**To fix this:**
1. Enable Vertex AI API: `gcloud services enable aiplatform.googleapis.com`
2. Set up Application Default Credentials: `gcloud auth application-default login`
3. Ensure your project ({PROJECT_ID}) has Vertex AI access
4. Check that the location ({LOCATION}) supports Gemini models

**Environment Variables Required:**
- GOOGLE_CLOUD_PROJECT: {PROJECT_ID}
- GOOGLE_CLOUD_LOCATION: {LOCATION}

**Current Status:**
- Project: {PROJECT_ID}
- Location: {LOCATION}
- Error Type: {type(e).__name__}

Please configure Vertex AI and restart the backend service.
            """
            
            yield Event(
                author=self.name,
                data={"type": "error", "message": error_msg}
            )
    
    root_agent = VertexAIRequiredAgent()

# Export for ADK
__all__ = ["root_agent"]