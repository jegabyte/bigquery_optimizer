"""
Result Verifier Agent
Validates optimization results and calculates cost savings
"""

from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai.types import GenerateContentConfig


class CostAnalysis(BaseModel):
    """Schema for cost analysis"""
    original_bytes: int = Field(description="Estimated bytes processed by original query")
    optimized_bytes: int = Field(description="Estimated bytes processed by optimized query")
    original_cost_usd: float = Field(description="Estimated cost of original query in USD")
    optimized_cost_usd: float = Field(description="Estimated cost of optimized query in USD")
    savings_percentage: float = Field(description="Percentage of cost saved")
    savings_usd: float = Field(description="Absolute cost savings in USD")


class PerformanceMetrics(BaseModel):
    """Schema for performance metrics"""
    estimated_original_time_seconds: float = Field(description="Estimated execution time for original query")
    estimated_optimized_time_seconds: float = Field(description="Estimated execution time for optimized query")
    time_improvement_percentage: float = Field(description="Percentage improvement in execution time")
    rows_scanned_original: int = Field(description="Estimated rows scanned by original query")
    rows_scanned_optimized: int = Field(description="Estimated rows scanned by optimized query")
    

class VerificationResult(BaseModel):
    """Output schema for result verification"""
    is_valid: bool = Field(description="Whether the optimization is valid and preserves query semantics")
    cost_analysis: CostAnalysis = Field(description="Cost comparison between original and optimized queries")
    performance_metrics: PerformanceMetrics = Field(description="Performance metrics comparison")
    validation_notes: str = Field(description="Notes about the validation process")
    warnings: list[str] = Field(default_factory=list, description="Any warnings about the optimization")
    optimization_score: int = Field(description="Overall optimization effectiveness score (0-100)")


# Create the result verifier agent
result_verifier_agent = genai.Agent(
    model="gemini-2.0-flash-exp",
    instructions="""You are a BigQuery optimization verification specialist. Your role is to validate that query optimizations are correct and calculate their benefits.

    Your tasks:
    
    1. **Semantic Validation**:
       - Verify the optimized query returns the same logical results as the original
       - Check that no data is inadvertently filtered out
       - Ensure JOINs maintain proper relationships
       - Validate aggregations produce correct results
    
    2. **Cost Estimation** (using BigQuery pricing model):
       - On-demand pricing: $6.25 per TB processed
       - Estimate bytes processed based on:
         * Full table scans vs. partition/cluster pruning
         * Column selection (each column adds to bytes processed)
         * JOIN operations (sum of all tables involved)
         * Subqueries (each subquery adds to total)
       
       For estimation purposes:
       - SELECT * typically scans 100% of table size
       - Selecting specific columns reduces by ~60-80%
       - Partition filtering can reduce by 90-95% if filtering recent data
       - Clustering can further reduce by 50-70%
       - Proper JOINs vs CROSS JOINs can reduce by 99%
    
    3. **Performance Estimation**:
       - Estimate query execution time based on:
         * Data volume scanned
         * Complexity of operations
         * Number of stages in execution plan
       - Consider parallelization benefits
       - Account for caching possibilities
    
    4. **Scoring** (0-100):
       - 0-20: Minimal or no improvement
       - 21-40: Some improvement, but more optimization possible
       - 41-60: Good optimization, significant benefits
       - 61-80: Very good optimization, major improvements
       - 81-100: Excellent optimization, near-optimal performance
    
    Base scoring on:
       - Cost reduction percentage (40% weight)
       - Performance improvement (30% weight)
       - Query simplicity/maintainability (15% weight)
       - Best practices adherence (15% weight)
    
    Provide realistic estimates based on typical BigQuery performance characteristics.
    If exact measurements aren't possible, provide reasonable estimates with explanations.
    """,
    generation_config=GenerateContentConfig(
        temperature=0.3,
        top_k=40,
        top_p=0.95,
        max_output_tokens=4096,
        response_mime_type="application/json",
        response_schema=VerificationResult,
    ),
)