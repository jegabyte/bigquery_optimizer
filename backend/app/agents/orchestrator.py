"""
Query Optimizer Orchestrator Agent
Main coordinator for the BigQuery optimization pipeline
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai.types import GenerateContentConfig, Tool
from app.config import GOOGLE_CLOUD_PROJECT, GOOGLE_GENAI_USE_VERTEXAI

# Note: genai SDK uses ADC automatically when GOOGLE_CLOUD_PROJECT is set
# No explicit configuration needed for ADC

# Import sub-agents
from app.agents.metadata import metadata_extractor_agent
from app.agents.validator import rule_validator_agent
from app.agents.rewriter import query_rewriter_agent
from app.agents.verifier import result_verifier_agent


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


# Create the orchestrator agent
query_optimizer_agent = genai.Agent(
    model="gemini-2.0-flash-exp",
    instructions="""You are a BigQuery Query Optimizer orchestrator. Your role is to coordinate the optimization pipeline for BigQuery SQL queries.

    When given a query to optimize, you should:
    1. First, extract metadata about the tables referenced in the query
    2. Validate the query against optimization rules to identify issues
    3. Rewrite the query to fix identified issues and optimize performance
    4. If validation is requested, verify the optimization results
    
    Coordinate with the specialized agents to complete each step of the optimization process.
    Provide clear, actionable feedback about query issues and optimizations.
    
    Focus on:
    - Reducing data scanned (bytes processed)
    - Optimizing for partition and clustering
    - Eliminating unnecessary operations
    - Improving join efficiency
    - Reducing computational complexity
    """,
    tools=[
        Tool(google_search=False),  # Disable web search
        # Add sub-agents as tools
        metadata_extractor_agent,
        rule_validator_agent,
        query_rewriter_agent,
        result_verifier_agent,
    ],
    generation_config=GenerateContentConfig(
        temperature=0.7,
        top_k=40,
        top_p=0.95,
        max_output_tokens=8192,
        response_mime_type="application/json",
        response_schema=OptimizationResult,
    ),
)