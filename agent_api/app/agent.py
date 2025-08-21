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

# 2. Rule Checker Agent
rule_checker = LlmAgent(
    name="rule_checker",
    model="gemini-2.5-flash",
    description="Checks query against BigQuery anti-patterns from Firestore/YAML",
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
    description="Applies optimizations step by step with validation",
    tools=[dry_run_tool],  # Add dry_run tool for query validation
    instruction=f"""
    You are the Query Optimization Agent. Fix violations and optimize the query with ACTUAL validation.
    
    You will receive:
    1. The original SQL query
    2. "metadata_output" - Table metadata (sizes, partitioning, clustering) from metadata_extractor
    3. "rules_output" - Violations and compliance information from rule_checker
    
    IMPORTANT: Use the bigquery_dry_run tool to validate queries and get ACTUAL cost estimates.
    
    Follow this process:
    1. First, run dry_run on the ORIGINAL query to get baseline metrics
    2. Parse the rules_output to understand what violations need to be fixed
    3. Apply optimizations step by step
    4. After EACH optimization, run dry_run to validate and get actual metrics
    5. Compare actual bytes_processed between original and optimized
    
    When calling bigquery_dry_run:
    - Pass the query as the first parameter
    - Pass project_id="{PROJECT_ID}" as the second parameter
    Example: bigquery_dry_run(query="SELECT ...", project_id="{PROJECT_ID}")
    
    Your response must be ONLY valid JSON in this exact format:
    {{
        "original_query": "SELECT * FROM table",
        "original_validation": {{
            "bytes_processed": 5000000000,
            "bytes_formatted": "5.00 GB",
            "estimated_cost_usd": 0.025,
            "valid": true
        }},
        "total_optimizations": 3,
        "steps": [
            {{
                "step": 1,
                "optimization": "Replace SELECT * with specific columns",
                "query_after": "SELECT id, timestamp, user_id FROM table",
                "validation": {{
                    "bytes_processed": 3000000000,
                    "bytes_formatted": "3.00 GB",
                    "estimated_cost_usd": 0.015,
                    "valid": true
                }},
                "actual_improvement": {{
                    "bytes_saved": 2000000000,
                    "bytes_saved_formatted": "2.00 GB",
                    "cost_saved_usd": 0.010,
                    "percentage_reduction": 40
                }}
            }},
            {{
                "step": 2,
                "optimization": "Add partition filter",
                "query_after": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01'",
                "validation": {{
                    "bytes_processed": 100000000,
                    "bytes_formatted": "100.00 MB",
                    "estimated_cost_usd": 0.0005,
                    "valid": true
                }},
                "actual_improvement": {{
                    "bytes_saved": 4900000000,
                    "bytes_saved_formatted": "4.90 GB",
                    "cost_saved_usd": 0.0245,
                    "percentage_reduction": 98
                }}
            }}
        ],
        "final_query": "SELECT id, timestamp, user_id FROM table WHERE timestamp >= '2024-01-01'",
        "final_validation": {{
            "bytes_processed": 100000000,
            "bytes_formatted": "100.00 MB",
            "estimated_cost_usd": 0.0005,
            "valid": true
        }},
        "total_actual_savings": {{
            "bytes_saved": 4900000000,
            "bytes_saved_formatted": "4.90 GB",
            "cost_saved_usd": 0.0245,
            "percentage_reduction": 98
        }},
        "summary": "Query validated and optimized: 5.00 GB → 100.00 MB (98% reduction, $0.0245 saved)"
    }}
    
    CRITICAL: Output ONLY the JSON. No markdown, no explanations, no text before or after.
    Show realistic, incremental improvements based on the violations found.
    """,
    output_key="optimization_output",
    after_agent_callback=create_streaming_callback("query_optimizer", "Query optimization completed", "optimization_output")
)

# 4. Final Reporter Agent
final_reporter = LlmAgent(
    name="final_reporter",
    model="gemini-2.5-flash",
    description="Creates comprehensive final report",
    instruction="""
    You are the Final Report Generator for BigQuery optimization.
    
    You will receive outputs from all previous stages:
    1. "metadata_output" - Table metadata
    2. "rules_output" - Rule violations and compliance
    3. "optimization_output" - Step-by-step optimizations
    
    Create a comprehensive executive summary that includes:
    - High-level performance improvements
    - Cost reduction estimates
    - Compliance improvements
    - Key recommendations
    
    Your response must be ONLY valid JSON in this exact format:
    {
        "executive_summary": {
            "original_complexity": "low|medium|high",
            "optimized_complexity": "low|medium|high",
            "cost_reduction": "XX%",
            "performance_gain": "XX% faster or YYms improvement",
            "data_reduction": "XX GB saved"
        },
        "metadata_summary": {
            "tables_analyzed": 3,
            "total_data_size": "1.5TB",
            "partitioned_tables": 2,
            "clustered_tables": 1
        },
        "rules_summary": {
            "total_checked": 22,
            "violations_found": 5,
            "compliance_before": "77%",
            "compliance_after": "100%"
        },
        "optimization_summary": {
            "steps_taken": 3,
            "final_query": "...",
            "estimated_cost_before": "$XX.XX",
            "estimated_cost_after": "$X.XX"
        },
        "recommendations": [
            "Consider partitioning table X by date",
            "Add clustering on frequently filtered columns",
            "Schedule regular maintenance for statistics"
        ],
        "best_practices": [
            "Always filter on partition columns first",
            "Use specific column names instead of SELECT *",
            "Leverage clustering for common filter patterns"
        ]
    }
    
    CRITICAL: Output ONLY the JSON. No markdown, no explanations, no text before or after.
    Base all metrics on actual data from previous stages.
    """,
    output_key="final_output",
    after_agent_callback=create_streaming_callback("final_reporter", "Final report generated", "final_output")
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
        final_reporter
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