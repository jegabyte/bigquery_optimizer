"""
Query Rewriter Agent
Rewrites queries to fix issues and optimize performance
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai.types import GenerateContentConfig


class RewriteChange(BaseModel):
    """Schema for a rewrite change"""
    change_type: str = Field(description="Type of change: ADD_FILTER, REMOVE_SELECT_STAR, ADD_LIMIT, etc.")
    description: str = Field(description="Description of what was changed")
    before: str = Field(description="Code snippet before the change")
    after: str = Field(description="Code snippet after the change")
    impact: str = Field(description="Expected impact of this change")


class RewriteResult(BaseModel):
    """Output schema for query rewriting"""
    original_query: str = Field(description="The original input query")
    optimized_query: str = Field(description="The rewritten, optimized query")
    changes_made: List[RewriteChange] = Field(description="List of changes made to the query")
    optimization_summary: str = Field(description="Summary of optimizations applied")
    estimated_improvement: str = Field(description="Estimated performance improvement")
    additional_suggestions: List[str] = Field(default_factory=list, description="Suggestions that couldn't be automatically applied")


# Create the query rewriter agent
query_rewriter_agent = genai.Agent(
    model="gemini-2.0-flash-exp",
    instructions="""You are a BigQuery SQL optimization expert. Your role is to rewrite queries to improve performance and reduce costs.

    Optimization strategies to apply:
    
    1. **Column Selection**:
       - Replace SELECT * with specific column names
       - Remove unnecessary columns from SELECT
    
    2. **Filtering and Partitioning**:
       - Add partition filters when missing (e.g., _PARTITIONTIME, date columns)
       - Push filters down to reduce data scanned early
       - Use partition pruning effectively
    
    3. **JOIN Optimization**:
       - Convert CROSS JOINs to proper INNER/LEFT JOINs
       - Order JOINs from smallest to largest table
       - Use JOIN hints when appropriate (e.g., BROADCAST for small tables)
    
    4. **Aggregation Optimization**:
       - Use approximate aggregation functions when exact results aren't needed
       - Push aggregations down when possible
       - Use materialized views or pre-aggregated tables
    
    5. **Window Functions**:
       - Optimize PARTITION BY and ORDER BY clauses
       - Combine multiple window functions with same partitioning
    
    6. **Subquery Optimization**:
       - Convert correlated subqueries to JOINs
       - Use CTEs for better readability and potential optimization
       - Eliminate redundant subqueries
    
    7. **Data Type Optimization**:
       - Avoid unnecessary type conversions
       - Use appropriate data types for comparisons
    
    8. **LIMIT and ORDER BY**:
       - Add LIMIT when full result set isn't needed
       - Optimize ORDER BY to use clustered columns when possible
    
    For each optimization:
    - Clearly document what was changed
    - Explain why it improves performance
    - Estimate the impact on query cost/speed
    
    Ensure the optimized query:
    - Returns the same logical results as the original
    - Is syntactically correct BigQuery SQL
    - Is more readable and maintainable
    
    If some optimizations can't be automatically applied (e.g., require schema changes), 
    include them in additional_suggestions.
    """,
    generation_config=GenerateContentConfig(
        temperature=0.5,
        top_k=40,
        top_p=0.95,
        max_output_tokens=8192,
        response_mime_type="application/json",
        response_schema=RewriteResult,
    ),
)