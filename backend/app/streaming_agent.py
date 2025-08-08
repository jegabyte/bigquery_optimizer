"""
Streaming Structured Output Agent for UI Integration
Returns JSON-structured optimization results with stage-by-stage streaming
"""

import os
import json
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent, LlmAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.agents.callback_context import CallbackContext
from google.adk.events import Event
from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.rules import RulesetManager
from app.tools.bigquery_metadata import fetch_bigquery_metadata

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
DATASET = os.getenv("BIGQUERY_DATASET", "analytics")

# Initialize rules manager
rules_manager = RulesetManager()

# Create BigQuery metadata tool
bigquery_metadata_tool = FunctionTool(
    func=fetch_bigquery_metadata
)

# --- Streaming Callbacks ---
def create_streaming_callback(agent_name: str, stage_message: str, output_key: str):
    """Creates a streaming callback for a specific agent"""
    def callback(callback_context: CallbackContext) -> None:
        """Streams output immediately after agent completes"""
        session = callback_context._invocation_context.session
        
        # Log for debugging
        logger.info(f"Callback triggered for {agent_name}")
        
        # Create a stage output
        stage_output = {
            "stage": agent_name,
            "timestamp": datetime.now().isoformat(),
            "status": "completed",
            "message": stage_message
        }
        
        # Get the output from the session state
        if output_key in session.state:
            stage_output["type"] = agent_name.replace("_", "-")
            stage_output["data"] = session.state[output_key]
            
            # Log the output for debugging
            logger.info(f"Agent {agent_name} output found in session state")
            
            # Try to clean up JSON output from all agents FIRST
            if isinstance(session.state[output_key], str):
                output_text = session.state[output_key].strip()
                
                # Remove markdown code block wrapper if present
                if output_text.startswith('```json'):
                    output_text = output_text[7:]  # Remove ```json
                if output_text.endswith('```'):
                    output_text = output_text[:-3]  # Remove ```
                output_text = output_text.strip()
                
                try:
                    # Try to parse as JSON
                    data = json.loads(output_text)
                    # Update session state with clean JSON
                    session.state[output_key] = data  # Store as dict, not string
                    stage_output["data"] = data  # Add parsed data to stage output
                    logger.info(f"{agent_name} output parsed successfully: {json.dumps(data)[:500]}...")
                except Exception as e:
                    logger.warning(f"Could not parse JSON from {agent_name}: {e}")
                    stage_output["data"] = session.state[output_key]  # Use raw text if parsing fails
            else:
                stage_output["data"] = session.state[output_key]
            
            # Log the clean stage output for debugging
            logger.info(f"Stage output for {agent_name}: {json.dumps(stage_output)}")
        else:
            logger.warning(f"No output found for {agent_name} with key {output_key}")
    
    return callback

# --- Stage 1: Metadata Extractor ---
metadata_extractor = LlmAgent(
    model="gemini-2.5-flash",
    name="metadata_extractor",
    description="Extracts and analyzes table metadata",
    instruction=f"""
    You must call the fetch_bigquery_metadata tool to get actual BigQuery table metadata.
    
    The user message contains a SQL query. Extract it and call:
    fetch_bigquery_metadata(query="<the SQL query>")
    
    The tool will return JSON with actual table statistics like:
    {{"tables_found": 2, "total_size_gb": 2.18, "total_row_count": 388066, "tables": [...]}}
    
    Your output must be ONLY the JSON returned by the tool, with no additional text, no separators, no markdown.
    
    Example:
    Input: {{"query": "SELECT * FROM users"}}
    You call: fetch_bigquery_metadata(query="SELECT * FROM users")
    Tool returns: {{"tables_found": 1, "total_size_gb": 0.5, ...}}
    Your output: {{"tables_found": 1, "total_size_gb": 0.5, ...}}
    
    Project: {PROJECT_ID}
    Dataset: {DATASET}
    """,
    tools=[bigquery_metadata_tool],
    output_key="metadata_output",
    after_agent_callback=create_streaming_callback(
        "metadata_extractor",
        "📊 Metadata Extraction Complete",
        "metadata_output"
    )
)

# --- Stage 2: Rule Checker ---
rule_checker = LlmAgent(
    model="gemini-2.5-flash",
    name="rule_checker",
    description="Checks query against optimization rules",
    instruction=f"""
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
    {{
        "rules_checked": 8,
        "violations_found": 3,
        "compliance_score": 62,
        "violations": [
            {{
                "rule_id": "NO_SELECT_STAR",
                "severity": "high",
                "impact": "Scanning 50% more data than needed",
                "fix": "Specify only required columns"
            }}
        ],
        "passed_rules": ["CROSS_JOIN_WARNING", "SUBQUERY_IN_WHERE"],
        "summary": "Found 3 violations that could reduce query cost by 75%"
    }}
    
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

# --- Stage 3: Query Optimizer ---
query_optimizer = LlmAgent(
    model="gemini-2.5-flash",
    name="query_optimizer",
    description="Applies optimizations step by step",
    instruction=f"""
    You are the Query Optimization Agent. Fix the violations found and optimize the query.
    
    Apply optimizations step by step:
    1. Fix each violation identified
    2. Show the query after each optimization
    3. Estimate the improvement
    
    Your response must be ONLY valid JSON in this exact format:
    {{
        "original_query": "SELECT * FROM table",
        "total_optimizations": 3,
        "steps": [
            {{
                "step": 1,
                "optimization": "Replace SELECT * with specific columns",
                "query_after": "SELECT id, timestamp, user_id FROM table",
                "improvement": "40% less data scanned",
                "bytes_saved": "500GB"
            }},
            {{
                "step": 2,
                "optimization": "Add partition filter",
                "query_after": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01'",
                "improvement": "95% less data scanned",
                "bytes_saved": "1.1TB"
            }}
        ],
        "final_query": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01' LIMIT 1000",
        "total_improvement": "99% reduction in data scanned",
        "summary": "Query optimized from scanning 1.25TB to just 12.5GB"
    }}
    
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

# --- Stage 4: Final Reporter ---
final_reporter = LlmAgent(
    model="gemini-2.5-flash",
    name="final_reporter",
    description="Creates comprehensive final report",
    instruction="""
    You are the Final Report Agent. Compile all results into a comprehensive report.
    
    Your response must be ONLY valid JSON in this exact format:
    {{
        "executive_summary": {{
            "original_complexity": "high",
            "optimized_complexity": "low",
            "cost_reduction": "95%",
            "performance_gain": "10x faster",
            "data_reduction": "1.2TB saved"
        }},
        "metadata_summary": {{
            "tables_analyzed": 2,
            "total_data_size": "1.25TB",
            "partitioned_tables": 2,
            "clustered_tables": 1
        }},
        "rules_summary": {{
            "total_checked": 8,
            "violations_found": 3,
            "compliance_before": "62%",
            "compliance_after": "100%"
        }},
        "optimization_summary": {{
            "steps_taken": 3,
            "final_query": "...",
            "estimated_cost_before": "$125",
            "estimated_cost_after": "$6.25"
        }},
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
    }}
    
    CRITICAL: Output ONLY the JSON. No markdown, no explanations, no text before or after.
    Make the report actionable and easy to understand.
    """,
    output_key="final_output",
    after_agent_callback=create_streaming_callback(
        "final_reporter",
        "📋 Final Report Generated",
        "final_output"
    )
)

# --- Streaming Pipeline ---
streaming_pipeline = SequentialAgent(
    name="streaming_pipeline",
    description="Optimization pipeline with stage-by-stage streaming",
    sub_agents=[
        metadata_extractor,
        rule_checker,
        query_optimizer,
        final_reporter
    ]
)

# --- Main Orchestrator ---
streaming_orchestrator = LlmAgent(
    name="streaming_orchestrator",
    model="gemini-2.5-flash",
    description="Orchestrates optimization with streaming outputs",
    instruction=f"""
    You are the BigQuery Optimization Orchestrator with streaming capabilities.
    
    When you receive a query:
    1. Start the optimization pipeline
    2. Each stage will stream its output immediately
    3. Provide clear stage transitions
    
    The pipeline stages are:
    1. 📊 Metadata Extraction - Analyze table structure and size
    2. ✅ Rule Checking - Identify optimization opportunities  
    3. 🚀 Query Optimization - Apply fixes step by step
    4. 📋 Final Report - Comprehensive summary
    
    Each stage output will be streamed as soon as it completes.
    
    Configuration:
    - Project: {PROJECT_ID}
    - Dataset: {DATASET}
    - Location: {LOCATION}
    
    Start by acknowledging the query and beginning the pipeline.
    """,
    sub_agents=[streaming_pipeline]
)

# Export the root agent
root_agent = streaming_orchestrator

__all__ = ["root_agent"]