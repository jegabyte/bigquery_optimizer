"""
Structured Output Agent for UI Integration
Returns JSON-structured optimization results for frontend display
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
from google.adk.agents.callback_context import CallbackContext
from google.adk.events import Event
from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.rules import RulesetManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
DATASET = os.getenv("BIGQUERY_DATASET", "analytics")

# Initialize rules manager
rules_manager = RulesetManager()

# --- Structured Output Models ---
class TableMetadata(BaseModel):
    """Table metadata structure"""
    table_path: str = Field(description="Full table path")
    project: str = Field(description="Project ID")
    dataset: str = Field(description="Dataset name")
    table_name: str = Field(description="Table name")
    row_count: int = Field(description="Estimated row count")
    size_gb: float = Field(description="Table size in GB")
    partitioned: bool = Field(description="Is table partitioned")
    partition_field: str = Field(default="", description="Partition field if partitioned")
    clustered: bool = Field(description="Is table clustered")
    cluster_fields: List[str] = Field(default_factory=list, description="Clustering fields")
    schema_summary: str = Field(description="Brief schema description")

class RuleViolation(BaseModel):
    """Rule violation structure"""
    rule_id: str = Field(description="Rule identifier")
    rule_name: str = Field(description="Rule name")
    severity: str = Field(description="Severity level: error, warning, info")
    description: str = Field(description="What was detected")
    fix_suggestion: str = Field(description="How to fix it")
    impact: str = Field(description="Performance impact if not fixed")

class OptimizationStep(BaseModel):
    """Single optimization step"""
    step_number: int = Field(description="Step sequence number")
    rule_fixed: str = Field(description="Which rule is being fixed")
    description: str = Field(description="What optimization is applied")
    query_after: str = Field(description="Query after this optimization")
    estimated_improvement: str = Field(description="Estimated improvement from this step")

class OptimizationResult(BaseModel):
    """Complete optimization result for UI"""
    # Input Analysis
    original_query: str = Field(description="Original input query")
    query_complexity: str = Field(description="Query complexity: low, medium, high")
    
    # Metadata Section
    tables_analyzed: List[TableMetadata] = Field(description="Metadata for all tables")
    total_data_size_gb: float = Field(description="Total data size to be scanned")
    
    # Rule Analysis Section
    rules_checked: int = Field(description="Total number of rules checked")
    rules_passed: List[str] = Field(description="List of rule IDs that passed")
    violations: List[RuleViolation] = Field(description="List of rule violations found")
    compliance_score: int = Field(description="Percentage of rules passed")
    
    # Optimization Section
    optimization_steps: List[OptimizationStep] = Field(description="Step-by-step optimizations")
    final_query: str = Field(description="Final optimized query")
    
    # Performance Metrics
    estimated_cost_reduction: str = Field(description="Estimated cost reduction percentage")
    estimated_performance_gain: str = Field(description="Estimated performance improvement")
    bytes_saved: str = Field(description="Estimated bytes saved")
    
    # Recommendations
    additional_recommendations: List[str] = Field(description="Additional optimization suggestions")
    best_practices_tips: List[str] = Field(description="General best practices to follow")

# --- Callback to collect structured data ---
def collect_structured_data_callback(callback_context: CallbackContext) -> None:
    """Collects data in structured format for UI"""
    session = callback_context._invocation_context.session
    
    # Initialize structured result if not exists
    if "structured_result" not in callback_context.state:
        callback_context.state["structured_result"] = {}
    
    # Collect from different agents
    if "metadata_json" in session.state:
        callback_context.state["structured_result"]["metadata"] = session.state["metadata_json"]
    
    if "rules_json" in session.state:
        callback_context.state["structured_result"]["rules"] = session.state["rules_json"]
    
    if "optimization_json" in session.state:
        callback_context.state["structured_result"]["optimization"] = session.state["optimization_json"]

# --- Agent Definitions ---

# 1. Structured Metadata Extractor
structured_metadata_extractor = LlmAgent(
    model="gemini-2.5-flash",
    name="structured_metadata_extractor",
    description="Extracts metadata in structured JSON format",
    instruction=f"""
    Extract metadata for all tables in the query and return structured JSON.
    
    For the query provided, identify all tables and create metadata for each.
    
    Your response must be a valid JSON object with this structure:
    {{
        "tables": [
            {{
                "table_path": "full.table.path",
                "project": "project-id",
                "dataset": "dataset-name",
                "table_name": "table-name",
                "row_count": 1500000000,
                "size_gb": 1250.5,
                "partitioned": true,
                "partition_field": "timestamp",
                "clustered": true,
                "cluster_fields": ["user_id", "event_type"],
                "schema_summary": "5 columns: id, timestamp, user_id, event_type, properties"
            }}
        ],
        "total_size_gb": 1250.5
    }}
    
    Use realistic BigQuery metadata.
    Project: {PROJECT_ID}
    Dataset: {DATASET}
    """,
    output_key="metadata_json",
    after_agent_callback=collect_structured_data_callback
)

# 2. Structured Rule Checker
structured_rule_checker = LlmAgent(
    model="gemini-2.5-flash",
    name="structured_rule_checker",
    description="Checks rules and returns structured violations",
    instruction=f"""
    Analyze the query against BigQuery optimization rules and return structured JSON.
    
    Check for these common issues:
    - NO_SELECT_STAR: Using SELECT * (except COUNT(*))
    - MISSING_PARTITION_FILTER: No filter on partition column for partitioned tables
    - MISSING_LIMIT: No LIMIT clause for non-aggregated queries
    - CROSS_JOIN_WARNING: Implicit or explicit cross joins
    - SUBQUERY_IN_WHERE: Subqueries that could be JOINs
    - INEFFICIENT_JOIN_ORDER: Large tables joined before small ones
    
    Your response must be a valid JSON object with this structure:
    {{
        "rules_checked": 8,
        "rules_passed": ["CROSS_JOIN_WARNING", "SUBQUERY_IN_WHERE"],
        "violations": [
            {{
                "rule_id": "NO_SELECT_STAR",
                "rule_name": "Avoid SELECT *",
                "severity": "warning",
                "description": "Query uses SELECT * which fetches all columns",
                "fix_suggestion": "Specify only required columns",
                "impact": "30-50% reduction in data scanned"
            }},
            {{
                "rule_id": "MISSING_LIMIT",
                "rule_name": "Missing LIMIT Clause",
                "severity": "info",
                "description": "Query has no LIMIT clause",
                "fix_suggestion": "Add LIMIT 1000 for testing or appropriate limit",
                "impact": "Prevents full table scan during development"
            }}
        ],
        "compliance_score": 75
    }}
    
    Be specific about violations found in the actual query.
    """,
    output_key="rules_json",
    after_agent_callback=collect_structured_data_callback
)

# 3. Structured Optimizer
structured_optimizer = LlmAgent(
    model="gemini-2.5-flash",
    name="structured_optimizer",
    description="Applies optimizations and returns structured steps",
    instruction=f"""
    Based on the metadata and rule violations, optimize the query step-by-step.
    
    Return structured JSON showing each optimization step.
    
    Your response must be a valid JSON object with this structure:
    {{
        "original_query": "SELECT * FROM table",
        "optimization_steps": [
            {{
                "step_number": 1,
                "rule_fixed": "NO_SELECT_STAR",
                "description": "Replace SELECT * with specific columns",
                "query_after": "SELECT id, timestamp, user_id FROM table",
                "estimated_improvement": "40% less data scanned"
            }},
            {{
                "step_number": 2,
                "rule_fixed": "MISSING_PARTITION_FILTER",
                "description": "Add partition filter to reduce scan",
                "query_after": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01'",
                "estimated_improvement": "95% less data scanned"
            }},
            {{
                "step_number": 3,
                "rule_fixed": "MISSING_LIMIT",
                "description": "Add LIMIT clause",
                "query_after": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01' LIMIT 1000",
                "estimated_improvement": "Capped result set"
            }}
        ],
        "final_query": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01' LIMIT 1000",
        "total_improvement": "99% reduction in data scanned"
    }}
    
    Show realistic, incremental improvements.
    """,
    output_key="optimization_json",
    after_agent_callback=collect_structured_data_callback
)

# 4. Final JSON Assembler
final_json_assembler = LlmAgent(
    model="gemini-2.5-flash",
    name="final_json_assembler",
    description="Assembles all data into final structured output",
    instruction="""
    Combine all the structured data into a final OptimizationResult JSON.
    
    Use data from:
    - metadata_json: Table metadata
    - rules_json: Rule violations
    - optimization_json: Optimization steps
    
    Create a complete JSON response following the OptimizationResult schema:
    
    {
        "original_query": "...",
        "query_complexity": "medium",
        "tables_analyzed": [...],
        "total_data_size_gb": 1250.5,
        "rules_checked": 8,
        "rules_passed": [...],
        "violations": [...],
        "compliance_score": 75,
        "optimization_steps": [...],
        "final_query": "...",
        "estimated_cost_reduction": "95%",
        "estimated_performance_gain": "10x faster",
        "bytes_saved": "1.2 TB",
        "additional_recommendations": [
            "Consider creating a materialized view for this query pattern",
            "Add clustering on frequently filtered columns",
            "Use APPROX functions for aggregations when exact results aren't needed"
        ],
        "best_practices_tips": [
            "Always filter on partition columns first",
            "Specify exact columns instead of SELECT *",
            "Use LIMIT during development and testing"
        ]
    }
    
    Ensure all fields are populated with realistic values.
    Make the response valid JSON that can be parsed by the frontend.
    """,
    output_schema=OptimizationResult,
    output_key="final_structured_result"
)

# --- Optimization Pipeline ---
structured_pipeline = SequentialAgent(
    name="structured_optimization_pipeline",
    description="Optimization pipeline that returns structured JSON for UI",
    sub_agents=[
        structured_metadata_extractor,
        structured_rule_checker,
        structured_optimizer,
        final_json_assembler
    ]
)

# --- Main Orchestrator ---
structured_orchestrator = LlmAgent(
    name="structured_orchestrator",
    model="gemini-2.5-flash",
    description="Returns structured JSON optimization results for UI",
    instruction=f"""
    You orchestrate query optimization and return structured JSON for the UI.
    
    When you receive a query:
    1. Pass it through the optimization pipeline
    2. Return the final structured result
    
    The result will be a complete JSON object with all optimization details.
    
    Configuration:
    - Project: {PROJECT_ID}
    - Dataset: {DATASET}
    - Location: {LOCATION}
    """,
    sub_agents=[structured_pipeline]
)

# Export the root agent
root_agent = structured_orchestrator

__all__ = ["root_agent"]