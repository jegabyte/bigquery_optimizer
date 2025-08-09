"""
Metadata Extractor Agent
Extracts table references from SQL and fetches BigQuery metadata
"""

import os
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from app.tools.bigquery_metadata import fetch_tables_metadata
from app.agents.callbacks import create_streaming_callback

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
DATASET = os.getenv("BIGQUERY_DATASET", "analytics")

# Create BigQuery metadata tool
bigquery_metadata_tool = FunctionTool(
    func=fetch_tables_metadata
)

# Metadata Extractor Agent
metadata_extractor = LlmAgent(
    model="gemini-2.5-flash",
    name="metadata_extractor",
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
    - If only table name: use project="{PROJECT_ID}" and dataset="analytics" 
    - If dataset.table: use project="{PROJECT_ID}" and the specified dataset
    - If project.dataset.table: use as-is
    - Remove all backticks from table paths
    - For wildcard tables, keep the wildcard pattern (e.g., "events_*")
    - IMPORTANT: The default dataset is always "analytics" not "{DATASET}"
    
    STEP 3: Call the tool with the extracted table paths:
    fetch_tables_metadata(table_paths=["path1", "path2", ...])
    
    Example SQL parsing:
    - "SELECT * FROM events" → ["aiva-e74f3.analytics.events"]
    - "SELECT * FROM `project.dataset.table`" → ["project.dataset.table"]
    - "SELECT * FROM analytics.events_*" → ["aiva-e74f3.analytics.events_*"]
    - "SELECT * FROM mydata.events" → ["aiva-e74f3.mydata.events"]
    - "SELECT * FROM t1 JOIN analytics.t2" → ["aiva-e74f3.analytics.t1", "aiva-e74f3.analytics.t2"]
    - "WITH temp AS (SELECT * FROM base) SELECT * FROM temp" → ["aiva-e74f3.analytics.base"]
    
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
    tools=[bigquery_metadata_tool],
    output_key="metadata_output",
    after_agent_callback=create_streaming_callback(
        "metadata_extractor",
        "📊 Metadata Extraction Complete",
        "metadata_output"
    )
)