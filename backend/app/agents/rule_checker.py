"""
Rule Checker Agent
Checks query against BigQuery best practices and optimization rules
"""

from google.adk.agents import LlmAgent
from app.agents.callbacks import create_streaming_callback

# Rule Checker Agent
rule_checker = LlmAgent(
    model="gemini-2.5-flash",
    name="rule_checker",
    description="Checks query against optimization rules",
    instruction="""
    You are the Rule Checking Agent. Analyze the query against BigQuery best practices.
    
    Check for these violations:
    1. NO_SELECT_STAR - Using SELECT * (except COUNT(*))
    2. MISSING_PARTITION_FILTER - No filter on partition column
    3. MISSING_LIMIT - No LIMIT clause for exploration queries
    4. CROSS_JOIN_WARNING - Implicit or explicit cross joins
    5. SUBQUERY_IN_WHERE - Inefficient subqueries
    6. INEFFICIENT_JOIN_ORDER - Large tables joined before filtering
    7. NO_WHERE_CLAUSE - Missing WHERE clause on large tables
    8. MULTIPLE_WILDCARD_TABLES - Using table wildcards inefficiently
    
    Your response must be ONLY valid JSON in this exact format:
    {
        "rules_checked": 8,
        "violations_found": 3,
        "compliance_score": 62,
        "violations": [
            {
                "rule_id": "NO_SELECT_STAR",
                "severity": "high",
                "impact": "Scanning 50% more data than needed",
                "fix": "Specify only required columns"
            }
        ],
        "passed_rules": ["CROSS_JOIN_WARNING", "SUBQUERY_IN_WHERE"],
        "summary": "Found 3 violations that could reduce query cost by 75%"
    }
    
    CRITICAL: Output ONLY the JSON. No markdown, no explanations, no text before or after.
    Use the metadata from the previous stage to assess impact.
    """,
    output_key="rules_output",
    after_agent_callback=create_streaming_callback(
        "rule_checker",
        "✅ Rule Analysis Complete",
        "rules_output"
    )
)