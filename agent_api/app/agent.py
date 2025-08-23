"""
BigQuery Optimizer Agent - ADK Deployment Entry Point
All agent definitions consolidated for proper ADK deployment
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools import FunctionTool
# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from .bigquery_metadata import fetch_tables_metadata, bigquery_dry_run
from .callbacks import create_streaming_callback

# Import Backend API client for fetching rules
try:
    from .backend_api_client import backend_client
    logger.info("Backend API client initialized for rules fetching")
    backend_api_available = True
except ImportError as e:
    logger.warning(f"Could not import backend_api_client: {e}")
    backend_client = None
    backend_api_available = False

# Keep direct DB access as fallback only
try:
    from .bigquery_rules import fetch_rules_from_bigquery
    logger.info("BigQuery rules loader available (fallback)")
    fetch_rules_from_bigquery_available = True
except ImportError as e:
    logger.warning(f"Could not import bigquery_rules: {e}")
    fetch_rules_from_bigquery = None
    fetch_rules_from_bigquery_available = False

try:
    from .firestore_rules import fetch_rules_from_firestore
    logger.info("Firestore rules loader available (fallback)")
except ImportError as e:
    logger.warning(f"Could not import firestore_rules: {e}")
    fetch_rules_from_firestore = None

# --- Configuration ---
PROJECT_ID = os.getenv("BQ_PROJECT_ID", os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT")))
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
DATASET = os.getenv("BQ_DATASET", os.getenv("BIGQUERY_DATASET", "bq_optimizer"))

# --- Load Rules ---
def load_bq_anti_patterns():
    """Load BigQuery anti-patterns from Backend API (primary), or direct DB access (fallback)"""
    # Try to load from Backend API first (preferred)
    if backend_api_available and backend_client is not None:
        try:
            patterns_content = backend_client.fetch_rules()
            logger.info("✅ Loaded BigQuery anti-patterns from Backend API")
            return patterns_content
        except Exception as api_error:
            logger.warning(f"⚠️  Failed to load from Backend API: {api_error}")
    
    # Fallback to direct BigQuery access if Backend API is not available
    if fetch_rules_from_bigquery_available and fetch_rules_from_bigquery is not None:
        try:
            patterns_content = fetch_rules_from_bigquery(PROJECT_ID)
            logger.info("✅ Loaded BigQuery anti-patterns from BigQuery table (fallback)")
            return patterns_content
        except Exception as bq_error:
            logger.warning(f"⚠️  Failed to load from BigQuery: {bq_error}")
    
    # Try Firestore as third option
    if fetch_rules_from_firestore is not None:
        try:
            patterns_content = fetch_rules_from_firestore(PROJECT_ID)
            logger.info("✅ Loaded BigQuery anti-patterns from Firestore")
            return patterns_content
        except Exception as firestore_error:
            logger.warning(f"⚠️  Failed to load from Firestore: {firestore_error}")
        # Fallback to YAML file
        patterns_path = os.path.join(os.path.dirname(__file__), 'bq_anti_patterns.yaml')
        try:
            with open(patterns_path, 'r') as f:
                patterns_content = f.read()
            logger.info(f"✅ Loaded BigQuery anti-patterns from {patterns_path}")
            return patterns_content
        except Exception as e:
            logger.error(f"❌ Failed to load BigQuery anti-patterns from both sources: {e}")
            # Return default rules if both fail
            return """
version: 2
rules:
  - id: NO_SELECT_STAR
    title: "Avoid SELECT *"
    severity: warning
    enabled: true
    detect: "Flag wildcard projection (* or t.*) except COUNT(*), * EXCEPT(...), or * REPLACE(...)."
    fix: "Select only required columns."
  - id: MISSING_PARTITION_FILTER
    title: "Missing partition filter"
    severity: error
    enabled: true
    detect: "Partitioned table read without a WHERE on its partition column."
    fix: "Add a constant/param range filter on the partition column."
"""

BQ_ANTI_PATTERNS = load_bq_anti_patterns()

# --- Tool Definitions ---
fetch_metadata_tool = FunctionTool(fetch_tables_metadata)
dry_run_tool = FunctionTool(bigquery_dry_run)

# --- Agent Definitions ---

# 1. Metadata Extractor Agent
metadata_extractor = LlmAgent(
    name="metadata_extractor",
    model="gemini-2.5-flash",
    description="Extracts table references and fetches metadata",
    instruction=f"""
    You are a SQL parser that extracts all table references from a query and fetches their metadata.
    
    STEP 1: Parse the SQL query and extract ALL table references including:
    - Regular tables (e.g., dataset.table_name or project.dataset.table_name)
    - Tables with backticks (e.g., `project.dataset.table`)
    - Tables with wildcards (e.g., events_* or events_20*)
    - Views (treat them as tables)
    - CTEs should be ignored (WITH clauses define temporary names)
    - Subqueries with table references (extract the actual tables, not aliases)
    - Tables in JOIN clauses
    - Tables in FROM clauses
    - Tables in INSERT/UPDATE/DELETE statements
    
    STEP 2: For each table reference, determine its full path:
    - If only table name: use project="{PROJECT_ID}" and dataset="{DATASET}" 
    - If dataset.table: use project="{PROJECT_ID}" and the specified dataset
    - If project.dataset.table: use as-is
    - Remove all backticks from table paths
    - For wildcard tables, keep the wildcard pattern (e.g., "events_*")
    - IMPORTANT: The default dataset is always "{DATASET}" not "analytics"
    
    STEP 3: Call the tool with the extracted table paths:
    fetch_tables_metadata(table_paths=["path1", "path2", ...])
    
    Example SQL parsing:
    - "SELECT * FROM events" → ["{PROJECT_ID}.{DATASET}.events"]
    - "SELECT * FROM `project.dataset.table`" → ["project.dataset.table"]
    - "SELECT * FROM analytics.events_*" → ["{PROJECT_ID}.analytics.events_*"]
    - "SELECT * FROM mydata.events" → ["{PROJECT_ID}.mydata.events"]
    - "SELECT * FROM t1 JOIN analytics.t2" → ["{PROJECT_ID}.{DATASET}.t1", "{PROJECT_ID}.analytics.t2"]
    - "WITH temp AS (SELECT * FROM base) SELECT * FROM temp" → ["{PROJECT_ID}.{DATASET}.base"]
    
    STEP 4: Take the JSON response from the fetch_tables_metadata tool and transform it to include these fields:
    
    For each table in the response, extract these fields from the tool's response:
    - Use table_path as table_name
    - Include table_type field if present (TABLE/VIEW)
    - Include size_gb, row_count, column_names
    - Include partitioned, partition_field, clustered, cluster_fields
    - **CRITICAL FOR VIEWS**: If table_type is "VIEW" and view_definition exists in the tool response, 
      you MUST include the entire view_definition object unchanged:
      
    Example for a VIEW:
    {{
        "tables_found": 1,
        "total_size_gb": 0.0,
        "total_row_count": 0,
        "tables": [
            {{
                "table_name": "project.dataset.view_name",
                "table_type": "VIEW",
                "size_gb": 0.0,
                "row_count": 0,
                "column_names": [...],
                "partitioned": false,
                "partition_field": null,
                "clustered": false,
                "cluster_fields": [],
                "view_definition": {{
                    "sql": "SELECT * FROM `base_table`",
                    "underlying_tables": [
                        {{
                            "table_path": "project.dataset.base_table",
                            "table_name": "base_table",
                            "size_gb": 10.5,
                            "row_count": 1000000,
                            "partitioned": true,
                            "partition_field": "date",
                            "clustered": true,
                            "cluster_fields": ["user_id"]
                        }}
                    ],
                    "underlying_tables_count": 1,
                    "total_underlying_size_gb": 10.5,
                    "total_underlying_rows": 1000000,
                    "optimization_hints": [...]
                }}
            }}
        ]
    }}
    
    Output ONLY the JSON, no additional text or markdown.
    
    Default Project: {PROJECT_ID}
    Default Dataset: {DATASET}
    """,
    tools=[fetch_metadata_tool],
    output_key="metadata_output",
    after_agent_callback=create_streaming_callback("metadata_extractor", "Metadata extraction completed", "metadata_output")
)

# 2. Query Anti Pattern Analysis Agent
rule_checker = LlmAgent(
    name="rule_checker",
    model="gemini-2.5-flash",
    description="Analyzes query for BigQuery anti-patterns from Firestore/YAML",
    instruction=f"""
You are a BigQuery SQL anti-pattern checker.

You will receive:
1. The original SQL query to analyze
2. A JSON object called "metadata_output" from the previous stage containing table metadata

Parse the metadata_output to understand:
- Table sizes (size_gb, row_count)
- Partitioning configuration (partitioned, partition_field)
- Clustering configuration (clustered, cluster_fields)
- Table types (TABLE vs VIEW)
- For views: underlying table information

Evaluate the SQL against EVERY supplied anti-pattern rule from the "Rules" section.
Use the Metadata to understand table partitioning, clustering, sizes, and types.
Report findings as STRICT JSON only (no markdown, no explanations, no code fences).

Constraints:
- Map rule severities from bq_anti_patterns.yaml → output levels:
  error → "high", warning → "medium", info → "low".
- "rules_checked" = number of enabled rules supplied (22).
- "violations_found" = count of rules that FAILED.
- "compliance_score" = floor(100 * len(passed_rules) / rules_checked).
- "violations" items must include: rule_id, severity (high/medium/low), impact (short, specific), fix (one-line).
- Include every non-failed rule id in "passed_rules".
- Be precise and conservative; if unsure, do NOT invent violations.

When assessing impact, use actual metadata:
- If a table has size_gb=100, say "Scanning 100GB of data"
- If a table has row_count=1000000, say "Processing 1M rows"
- If a table is partitioned but filter is missing, say "Full scan on partitioned table (X GB)"
- If a view references large underlying tables, consider their sizes

# BigQuery Anti-Patterns (from bq_anti_patterns.yaml):
{BQ_ANTI_PATTERNS}

# Output (STRICT JSON; EXACT schema)
{{
  "rules_checked": <int>,
  "violations_found": <int>,
  "compliance_score": <int>,
  "violations": [
    {{
      "rule_id": "STRING",
      "severity": "high|medium|low",
      "impact": "STRING",
      "fix": "STRING"
    }}
  ],
  "passed_rules": ["RULE_ID", "..."],
  "summary": "STRING"
}}

CRITICAL: Output ONLY the JSON. No markdown, no explanations, no text before or after.
Use the metadata from metadata_output to provide specific, quantified impacts.
""",
    output_key="rules_output",
    after_agent_callback=create_streaming_callback("rule_checker", "Rule checking completed", "rules_output")
)

# 3. Query Optimizer Agent
query_optimizer = LlmAgent(
    name="query_optimizer",
    model="gemini-2.5-flash",
    description="Creates a single optimized query fixing all violations and improving performance",
    tools=[dry_run_tool],  # Add dry_run tool for query validation
    instruction=f"""
    You are the Query Optimization Agent. Your job is to produce a SINGLE optimized query that:
    1. Fixes all anti-pattern violations identified
    2. Maintains the exact same business logic and results as the original query
    3. Optimizes for cost and performance
    
    You will receive:
    1. The original SQL query
    2. "metadata_output" - Table metadata (sizes, partitioning, clustering) from metadata_extractor
    3. "rules_output" - Violations and compliance information from rule_checker
    
    IMPORTANT: Use the bigquery_dry_run tool to validate queries and get ACTUAL cost estimates.
    
    Follow this process:
    1. Run dry_run on the ORIGINAL query to get baseline metrics
    2. Analyze all violations from rules_output
    3. Create a SINGLE optimized query that addresses ALL issues at once
    4. Run dry_run on the optimized query to validate and get actual metrics
    5. Compare actual bytes_processed between original and optimized
    
    Apply these optimizations where applicable:
    - Replace SELECT * with specific columns needed
    - Add partition filters if table is partitioned
    - Add clustering filters if table is clustered
    - Use appropriate JOIN types and conditions
    - Eliminate subquery anti-patterns
    - Add LIMIT if appropriate
    - Fix any other violations identified
    
    When calling bigquery_dry_run:
    - Pass the query as the first parameter
    - Pass project_id="{PROJECT_ID}" as the second parameter
    Example: bigquery_dry_run(query="SELECT ...", project_id="{PROJECT_ID}")
    
    Your response must be ONLY valid JSON in this exact format:
    {{
        "original_query": "SELECT * FROM table",
        "original_metrics": {{
            "bytes_processed": 5000000000,
            "bytes_formatted": "5.00 GB",
            "estimated_cost_usd": 0.025,
            "valid": true
        }},
        "optimized_query": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY) LIMIT 10000",
        "optimized_metrics": {{
            "bytes_processed": 100000000,
            "bytes_formatted": "100.00 MB",
            "estimated_cost_usd": 0.0005,
            "valid": true
        }},
        "optimizations_applied": [
            "Replaced SELECT * with specific columns (id, timestamp, user_id)",
            "Added partition filter on timestamp column for last 30 days",
            "Added LIMIT clause to reduce data scanned"
        ],
        "total_optimizations": 3,
        "performance_improvement": {{
            "bytes_saved": 4900000000,
            "bytes_saved_formatted": "4.90 GB",
            "cost_saved_usd": 0.0245,
            "percentage_reduction": 98
        }},
        "summary": "Query optimized from 5.00 GB to 100.00 MB (98% reduction, $0.0245 saved)"
    }}
    
    CRITICAL: 
    - Output ONLY the JSON. No markdown, no explanations, no text before or after.
    - The optimized_query must be a SINGLE, complete SQL query that incorporates ALL optimizations
    - The query must maintain the same business logic as the original
    """,
    output_key="optimization_output",
    after_agent_callback=create_streaming_callback("query_optimizer", "Query optimization completed", "optimization_output")
)

# 4. Query Validation Agent - Validates optimized query against original
query_validation_agent = LlmAgent(
    name="query_validation_agent",
    model="gemini-2.5-flash",
    description="Validates optimized query structure and schema against original",
    tools=[dry_run_tool],  # Use dry_run tool to validate both queries
    instruction="""
    You are the Query Validation Agent that validates queries using BigQuery's dry run capability.
    
    IMPORTANT: You must use the bigquery_dry_run TOOL to validate queries. Do NOT try to write Python code or import modules.
    
    You will receive:
    1. The original SQL query (from user input)
    2. "optimization_output" - The optimized query and optimization details
    
    Use the bigquery_dry_run tool by calling it like this:
    bigquery_dry_run(query="SELECT ...")
    
    Perform EXACTLY these 2 validation checks:
    
    VALIDATION 1 - SYNTACTIC VALIDATION:
    - Call: bigquery_dry_run(query=<optimized_query_from_optimization_output>)
    - Parse the JSON response to check if "valid" is true
    - Mark as PASSED if valid=true (dry_run succeeds)
    - Mark as FAILED if valid=false (dry_run returns errors)
    - Include the error_message if validation fails
    
    VALIDATION 2 - SCHEMA VALIDATION:
    - Call: bigquery_dry_run(query=<original_query>)
    - Call: bigquery_dry_run(query=<optimized_query>)
    - Compare the schemas from both responses
    - Mark as PASSED if schemas match
    - Mark as WARNING if minor differences exist
    - Mark as FAILED if schemas are incompatible
    
    Your FINAL response must be ONLY valid JSON in this exact format:
    {
        "validation_status": "PASSED|FAILED|WARNING",
        "validation_timestamp": "ISO8601 timestamp",
        "syntactic_validation": {
            "status": "PASSED|FAILED",
            "message": "Query syntax is valid and all referenced tables/columns exist|Error details",
            "dry_run_success": true|false,
            "error_details": null|"Specific error from BigQuery if failed"
        },
        "schema_validation": {
            "status": "PASSED|FAILED|WARNING", 
            "message": "Schema matches: same columns and types|Schema mismatch details",
            "original_columns": 10,
            "optimized_columns": 10,
            "column_match": true|false,
            "type_match": true|false,
            "differences": ["List any differences found"]
        },
        "execution_time": 2.5,
        "validation_notes": "Brief summary of the two validation checks",
        "final_optimized_query": "SELECT ... (the final validated query)"
    }
    
    CRITICAL: 
    - Output ONLY the JSON. No markdown, no explanations, no text before or after.
    - Use the dry_run tool to get actual schema information
    - Mark validation as PASSED if queries are semantically equivalent
    - Mark as WARNING if minor differences exist but results are equivalent
    - Mark as FAILED if queries would return different results
    """,
    output_key="validation_output",
    after_agent_callback=create_streaming_callback("query_validation_agent", "Query validation completed", "validation_output")
)

# --- Pipeline Definition ---

# Streaming Pipeline - Sequential execution of all agents
streaming_pipeline = SequentialAgent(
    name="streaming_pipeline",
    description="Optimization pipeline with stage-by-stage streaming",
    sub_agents=[
        metadata_extractor,
        rule_checker,
        query_optimizer,
        query_validation_agent  # Replaced final_reporter with query_validation_agent
    ]
)

# Main Orchestrator - Entry point for the optimization
streaming_orchestrator = LlmAgent(
    name="streaming_orchestrator",
    model="gemini-2.5-flash",
    description="Orchestrates optimization with streaming outputs",
    instruction=f"""
    You are the BigQuery Optimization Orchestrator with streaming capabilities.
    
    When you receive a query to optimize:
    1. Pass it directly to the streaming_pipeline
    2. Each stage will stream its output immediately
    3. The pipeline will accumulate outputs from each stage
    
    The pipeline stages process data sequentially:
    1. 📊 Metadata Extraction - Analyzes the query and fetches table metadata
       → Outputs: metadata_output (JSON with table info)
    
    2. ✅ Rule Checking - Receives query + metadata_output, checks against bq_anti_patterns.yaml
       → Outputs: rules_output (JSON with violations and compliance)
    
    3. 🚀 Query Optimization - Receives query + metadata_output + rules_output, applies fixes
       → Outputs: optimization_output (JSON with step-by-step optimizations)
    
    4. 📋 Final Report - Receives all previous outputs, creates summary
       → Outputs: final_output (JSON with comprehensive report)
    
    Configuration:
    - Project: {PROJECT_ID}
    - Dataset: {DATASET}
    - Location: {LOCATION}
    
    Simply pass the query to the streaming_pipeline and it will handle the rest.
    """,
    sub_agents=[streaming_pipeline]
)

# --- Root Agent Export ---
root_agent = streaming_orchestrator