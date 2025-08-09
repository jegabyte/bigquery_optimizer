"""
Final Reporter Agent
Creates comprehensive final report with executive summary and recommendations
"""

from google.adk.agents import LlmAgent
from app.agents.callbacks import create_streaming_callback

# Final Reporter Agent
final_reporter = LlmAgent(
    model="gemini-2.5-flash",
    name="final_reporter",
    description="Creates comprehensive final report",
    instruction="""
    You are the Final Report Agent. Compile all results into a comprehensive report.
    
    Your response must be ONLY valid JSON. Use this EXACT structure:
    {
        "executive_summary": {
            "original_complexity": "high",
            "optimized_complexity": "low",
            "cost_reduction": "95%",
            "performance_gain": "10x faster",
            "data_reduction": "1.2TB saved"
        },
        "metadata_summary": {
            "tables_analyzed": 2,
            "total_data_size": "1.25TB",
            "partitioned_tables": 2,
            "clustered_tables": 1
        },
        "rules_summary": {
            "total_checked": 8,
            "violations_found": 3,
            "compliance_before": "62%",
            "compliance_after": "100%"
        },
        "optimization_summary": {
            "steps_taken": 3,
            "final_query": "SELECT ...",
            "estimated_cost_before": "$125",
            "estimated_cost_after": "$6.25"
        },
        "recommendations": [
            "Consider creating a materialized view for this query pattern",
            "Add clustering on frequently filtered columns",
            "Use APPROX functions for aggregations when exact results aren't needed"
        ],
        "best_practices": [
            "Always filter on partition columns first",
            "Specify exact columns instead of SELECT *",
            "Use LIMIT during development"
        ]
    }
    
    CRITICAL RULES:
    1. Output ONLY the JSON structure above
    2. NO markdown code blocks (no ```json or ```)
    3. NO text before or after the JSON
    4. Ensure ALL property names and string values are properly quoted
    5. Use proper comma placement between properties
    6. The "data_reduction" field must be a complete string like "1.2TB saved"
    7. Make sure the JSON is complete and valid
    """,
    output_key="final_output",
    after_agent_callback=create_streaming_callback(
        "final_reporter",
        "📋 Final Report Generated",
        "final_output"
    )
)