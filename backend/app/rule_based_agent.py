"""
Rule-based BigQuery Optimizer with Clear Intermediate Outputs
Uses predefined rules to analyze and optimize queries step-by-step
"""

import os
import json
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, List
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent, LlmAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.adk.tools import FunctionTool
from google.genai import types as genai_types

from app.rules import RulesetManager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
DATASET = os.getenv("BIGQUERY_DATASET", "analytics")

# Initialize rules manager
rules_manager = RulesetManager()

# --- Tool Functions ---
async def analyze_query_with_rules(query: str) -> Dict[str, Any]:
    """Analyze query against optimization rules"""
    
    # Load rules if not already loaded
    if not rules_manager.rules:
        await rules_manager.load_rules()
    
    active_rules = rules_manager.get_active_rules()
    
    analysis = {
        "query": query,
        "timestamp": datetime.now().isoformat(),
        "rules_checked": len(active_rules),
        "violations": [],
        "passed_rules": [],
        "optimization_suggestions": []
    }
    
    # Check each rule (simplified - in production use proper SQL parser)
    query_upper = query.upper()
    
    for rule in active_rules:
        rule_id = rule["id"]
        
        if rule_id == "NO_SELECT_STAR":
            if "SELECT *" in query_upper and "COUNT(*)" not in query_upper:
                analysis["violations"].append({
                    "rule_id": rule_id,
                    "name": rule["name"],
                    "severity": rule["severity"],
                    "message": rule["detection_instructions"],
                    "fix": rule["remediation_instructions"]
                })
            else:
                analysis["passed_rules"].append(rule_id)
                
        elif rule_id == "MISSING_LIMIT":
            if "LIMIT" not in query_upper and "GROUP BY" not in query_upper:
                analysis["violations"].append({
                    "rule_id": rule_id,
                    "name": rule["name"],
                    "severity": rule["severity"],
                    "message": "Query lacks LIMIT clause",
                    "fix": "Add LIMIT clause to prevent scanning all rows"
                })
            else:
                analysis["passed_rules"].append(rule_id)
                
        elif rule_id == "CROSS_JOIN_WARNING":
            if "CROSS JOIN" in query_upper or (", " in query and "WHERE" not in query_upper):
                analysis["violations"].append({
                    "rule_id": rule_id,
                    "name": rule["name"],
                    "severity": rule["severity"],
                    "message": "Potential cross join detected",
                    "fix": "Use explicit JOIN with ON condition"
                })
            else:
                analysis["passed_rules"].append(rule_id)
        
        # Add more rule checks as needed
    
    return analysis

def fetch_table_metadata(table_name: str) -> Dict[str, Any]:
    """Fetch BigQuery table metadata"""
    
    # Extract table parts
    parts = table_name.replace("`", "").split(".")
    
    metadata = {
        "table": table_name,
        "project": parts[0] if len(parts) > 0 else PROJECT_ID,
        "dataset": parts[1] if len(parts) > 1 else DATASET,
        "table_name": parts[2] if len(parts) > 2 else parts[-1],
        "schema": [
            {"name": "id", "type": "STRING", "mode": "REQUIRED"},
            {"name": "timestamp", "type": "TIMESTAMP", "mode": "REQUIRED"},
            {"name": "user_id", "type": "STRING", "mode": "NULLABLE"},
            {"name": "event_type", "type": "STRING", "mode": "NULLABLE"},
            {"name": "properties", "type": "JSON", "mode": "NULLABLE"}
        ],
        "partitioning": {
            "type": "DAY",
            "field": "timestamp"
        },
        "clustering": {
            "fields": ["user_id", "event_type"]
        },
        "estimated_size_gb": 1250,
        "estimated_rows": 1_500_000_000,
        "last_modified": datetime.now().isoformat()
    }
    
    return metadata

# Create tools
rule_analyzer_tool = FunctionTool(func=analyze_query_with_rules)
metadata_tool = FunctionTool(func=fetch_table_metadata)

# --- Agent 1: Metadata Extractor ---
metadata_extractor = LlmAgent(
    model="gemini-2.5-flash",
    name="metadata_extractor",
    description="Extracts and displays table metadata and schema information",
    instruction=f"""
    You are a BigQuery metadata specialist. Your job is to:
    
    1. Parse the SQL query to identify all tables referenced
    2. Use the fetch_table_metadata tool to get metadata for each table
    3. Display the metadata in a clear, formatted way
    
    For each table found, show:
    - Full table path
    - Schema (columns and types)
    - Partitioning configuration
    - Clustering configuration
    - Table size and row count
    
    Format your output clearly with sections for each table.
    Make the metadata easy to understand.
    
    Project: {PROJECT_ID}
    Dataset: {DATASET}
    """,
    tools=[metadata_tool],
    output_key="metadata_analysis"
)

# --- Agent 2: Rule Checker ---
rule_checker = LlmAgent(
    model="gemini-2.5-flash",
    name="rule_checker",
    description="Checks query against optimization rules and shows violations",
    instruction=f"""
    You are a BigQuery optimization rule checker. Your job is to:
    
    1. Use the analyze_query_with_rules tool to check the query
    2. Display the results in a clear, formatted report
    
    Show:
    ✅ **Rules Passed:** List all rules that the query follows correctly
    ❌ **Rule Violations:** For each violation, show:
       - Rule name and severity
       - What was detected
       - How to fix it
       - Example of the fix
    
    📊 **Summary:**
    - Total rules checked
    - Rules passed
    - Violations found
    - Overall query health score
    
    Be specific about what needs to be fixed and why.
    """,
    tools=[rule_analyzer_tool],
    output_key="rule_analysis"
)

# --- Agent 3: Query Optimizer ---
query_optimizer = LlmAgent(
    model="gemini-2.5-flash",
    name="query_optimizer",
    description="Applies optimizations based on rules and metadata",
    instruction=f"""
    You are a BigQuery SQL optimizer. Based on:
    - The metadata from 'metadata_analysis'
    - The rule violations from 'rule_analysis'
    
    Your job is to:
    
    1. **Show the Original Query:**
       Display the original query with line numbers
    
    2. **List Optimizations to Apply:**
       For each violation found, explain:
       - What optimization will be applied
       - Why it improves performance
       - Estimated impact
    
    3. **Show Step-by-Step Transformation:**
       Apply each optimization one by one, showing:
       - Step 1: Fix [rule name] - show the query after this fix
       - Step 2: Fix [next rule] - show the query after this fix
       - Continue for all optimizations
    
    4. **Final Optimized Query:**
       Show the final query with all optimizations applied
    
    5. **Performance Comparison:**
       - Estimated bytes scanned: before vs after
       - Estimated cost: before vs after
       - Estimated execution time: before vs after
    
    Be very clear about each transformation step.
    """,
    output_key="optimization_result"
)

# --- Agent 4: Final Reporter ---
final_reporter = LlmAgent(
    model="gemini-2.5-flash",
    name="final_reporter",
    description="Creates a comprehensive optimization report",
    instruction="""
    You are a technical report writer. Based on all the analysis, create a final report with:
    
    # BigQuery Query Optimization Report
    
    ## 1. Input Query Analysis
    - Original query characteristics
    - Tables involved
    - Initial complexity assessment
    
    ## 2. Metadata Insights
    - Table sizes and structures
    - Partitioning and clustering opportunities
    - Schema considerations
    
    ## 3. Rule Compliance
    - Rules checked and results
    - Critical violations found
    - Best practices assessment
    
    ## 4. Optimizations Applied
    - List of optimizations with rationale
    - Step-by-step transformation process
    - Performance improvements
    
    ## 5. Final Optimized Query
    - The fully optimized query
    - Key improvements highlighted
    
    ## 6. Expected Benefits
    - Cost reduction estimate
    - Performance improvement estimate
    - Best practices compliance score
    
    ## 7. Additional Recommendations
    - Further optimization opportunities
    - Monitoring suggestions
    - Index or materialized view recommendations
    
    Make the report comprehensive but easy to scan.
    Use formatting, emojis, and sections effectively.
    """,
    output_key="final_report"
)

# --- Main Optimization Pipeline ---
optimization_pipeline = SequentialAgent(
    name="rule_based_optimization_pipeline",
    description="Step-by-step query optimization with clear intermediate outputs",
    sub_agents=[
        metadata_extractor,
        rule_checker,
        query_optimizer,
        final_reporter
    ]
)

# --- Orchestrator ---
rule_based_orchestrator = LlmAgent(
    name="rule_based_orchestrator",
    model="gemini-2.5-flash",
    description="Orchestrates rule-based BigQuery optimization",
    instruction=f"""
    You are the main orchestrator for BigQuery query optimization.
    
    When you receive a query:
    1. Acknowledge receipt and explain the optimization process
    2. Pass the query to the optimization pipeline
    3. The pipeline will:
       - Extract and display metadata
       - Check against optimization rules
       - Apply optimizations step-by-step
       - Generate a final report
    
    Each step will show its output clearly before moving to the next.
    
    Configuration:
    - Project: {PROJECT_ID}
    - Dataset: {DATASET}
    - Location: {LOCATION}
    """,
    sub_agents=[optimization_pipeline]
)

# Export the root agent
root_agent = rule_based_orchestrator

__all__ = ["root_agent"]