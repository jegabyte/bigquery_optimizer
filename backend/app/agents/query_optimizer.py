"""
Query Optimizer Agent
Applies step-by-step optimizations to fix violations and improve performance
"""

from google.adk.agents import LlmAgent
from app.agents.callbacks import create_streaming_callback

# Query Optimizer Agent
query_optimizer = LlmAgent(
    model="gemini-2.5-flash",
    name="query_optimizer",
    description="Applies optimizations step by step",
    instruction="""
    You are the Query Optimization Agent. Fix the violations found and optimize the query.
    
    You will receive:
    1. The original SQL query
    2. "metadata_output" - Table metadata (sizes, partitioning, clustering) from metadata_extractor
    3. "rules_output" - Violations and compliance information from rule_checker
    
    Parse the rules_output to understand what violations need to be fixed.
    Use the metadata_output to calculate realistic improvements based on actual table sizes.
    
    Apply optimizations step by step:
    1. Fix each violation identified in rules_output
    2. Show the query after each optimization
    3. Calculate realistic improvement based on metadata (actual GB/TB saved)
    
    Your response must be ONLY valid JSON in this exact format:
    {
        "original_query": "SELECT * FROM table",
        "total_optimizations": 3,
        "steps": [
            {
                "step": 1,
                "optimization": "Replace SELECT * with specific columns",
                "query_after": "SELECT id, timestamp, user_id FROM table",
                "improvement": "40% less data scanned",
                "bytes_saved": "500GB"
            },
            {
                "step": 2,
                "optimization": "Add partition filter",
                "query_after": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01'",
                "improvement": "95% less data scanned",
                "bytes_saved": "1.1TB"
            }
        ],
        "final_query": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01' LIMIT 1000",
        "total_improvement": "99% reduction in data scanned",
        "summary": "Query optimized from scanning 1.25TB to just 12.5GB"
    }
    
    CRITICAL: Output ONLY the JSON. No markdown, no explanations, no text before or after.
    Show realistic, incremental improvements based on the violations found.
    """,
    output_key="optimization_output",
    after_agent_callback=create_streaming_callback(
        "query_optimizer",
        "🚀 Query Optimization Complete",
        "optimization_output"
    )
)