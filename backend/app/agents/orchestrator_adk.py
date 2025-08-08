"""
Query Optimizer Orchestrator Agent - ADK Implementation
Main coordinator for the BigQuery optimization pipeline
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
try:
    from adk import agents
    from adk.agents import LlmAgent
    ADK_AVAILABLE = True
except ImportError:
    # If ADK is not available, create a mock agent
    ADK_AVAILABLE = False
    class LlmAgent:
        def __init__(self, **kwargs):
            self.name = kwargs.get('name', 'mock_agent')
            self.system_instruction = kwargs.get('system_instruction', '')
import os

# Set up environment
os.environ["GOOGLE_CLOUD_PROJECT"] = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")


class OptimizationRequest(BaseModel):
    """Input schema for query optimization"""
    query: str = Field(description="The BigQuery SQL query to optimize")
    project_id: Optional[str] = Field(default=None, description="GCP project ID")
    dataset_id: Optional[str] = Field(default=None, description="BigQuery dataset ID") 
    validate: bool = Field(default=True, description="Whether to validate the optimization")


class OptimizationIssue(BaseModel):
    """Schema for optimization issues"""
    type: str = Field(description="Issue type (e.g., SELECT_STAR, NO_PARTITION_FILTER)")
    severity: str = Field(description="Severity level: critical, high, medium, low")
    description: str = Field(description="Description of the issue")
    line: Optional[int] = Field(default=None, description="Line number where issue occurs")
    impact: Optional[str] = Field(default=None, description="Impact on performance/cost")


class ValidationResult(BaseModel):
    """Schema for validation results"""
    original_cost: float = Field(description="Estimated cost of original query in USD")
    optimized_cost: float = Field(description="Estimated cost of optimized query in USD")
    cost_savings: float = Field(description="Cost savings percentage")
    bytes_processed_original: int = Field(description="Bytes processed by original query")
    bytes_processed_optimized: int = Field(description="Bytes processed by optimized query")
    estimated_rows_original: int = Field(description="Estimated rows scanned by original")
    estimated_rows_optimized: int = Field(description="Estimated rows scanned by optimized")


class OptimizationResult(BaseModel):
    """Output schema for query optimization"""
    original_query: str = Field(description="The original input query")
    optimized_query: str = Field(description="The optimized version of the query")
    issues: List[OptimizationIssue] = Field(description="List of issues found in the query")
    validation_result: Optional[ValidationResult] = Field(default=None, description="Validation results if requested")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata about the optimization")
    suggestions: List[str] = Field(default_factory=list, description="Additional optimization suggestions")


# Create the orchestrator agent using ADK's LlmAgent
query_optimizer_agent = LlmAgent(
    name="query_optimizer",
    model="models/gemini-1.5-flash",  # Using Gemini model
    system_instruction="""You are a BigQuery Query Optimizer orchestrator. Your role is to coordinate the optimization pipeline for BigQuery SQL queries.

    When given a query to optimize, you should:
    1. Extract metadata about the tables referenced in the query
    2. Validate the query against optimization rules to identify issues
    3. Rewrite the query to fix identified issues and optimize performance
    4. If validation is requested, verify the optimization results
    
    Focus on:
    - Reducing data scanned (bytes processed)
    - Optimizing for partition and clustering
    - Eliminating unnecessary operations
    - Improving join efficiency
    - Reducing computational complexity
    
    Analyze the query and provide:
    1. List of optimization issues found
    2. Optimized version of the query
    3. Cost savings estimate
    4. Specific suggestions for improvement
    
    Common BigQuery optimizations to check:
    - Avoid SELECT * - specify only needed columns
    - Use partition filters (e.g., _PARTITIONTIME, date columns)
    - Leverage clustering columns in WHERE and JOIN clauses
    - Avoid CROSS JOINs and cartesian products
    - Use approximate aggregation functions when appropriate
    - Push filters down to reduce data scanned early
    - Use LIMIT with ORDER BY for deterministic results
    - Consider using materialized views for repeated queries
    """,
    enable_db_writes=False,  # No database writes needed
    enable_code_execution=False,  # No code execution needed
)