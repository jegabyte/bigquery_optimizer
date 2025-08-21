#!/usr/bin/env python3
from google.cloud import bigquery

client = bigquery.Client(project='aiva-e74f3')

# Create table with new schema
create_sql = """
CREATE TABLE `aiva-e74f3.bq_optimizer.analyses` (
  -- Unique identifier
  analysis_id STRING NOT NULL,
  
  -- Reference to template
  template_id STRING,
  project_id STRING NOT NULL,
  
  -- Original query information
  original_query STRING NOT NULL,
  query_hash STRING,
  
  -- Analysis metadata
  analysis_type STRING,
  analysis_status STRING,
  
  -- Analysis results
  issues_found ARRAY<STRUCT<
    rule_id STRING,
    rule_name STRING,
    severity STRING,
    description STRING,
    impact STRING,
    suggestion STRING
  >>,
  
  -- Optimization results
  optimized_query STRING,
  optimization_applied BOOL,
  optimization_notes STRING,
  
  -- Cost analysis
  original_bytes_processed INT64,
  optimized_bytes_processed INT64,
  bytes_saved INT64,
  cost_saved_usd FLOAT64,
  savings_percentage FLOAT64,
  
  -- Performance metrics
  original_runtime_ms INT64,
  optimized_runtime_ms INT64,
  runtime_improvement_percentage FLOAT64,
  
  -- Validation results
  validation_status STRING,
  validation_errors ARRAY<STRING>,
  dry_run_successful BOOL,
  
  -- Stage Data - Store each stage's complete data
  stage_metadata JSON,
  stage_rules JSON,
  stage_optimization JSON,
  stage_report JSON,
  
  -- Complete analysis result from ADK
  adk_response JSON,
  
  -- User interaction
  created_by STRING,
  reviewed_by STRING,
  review_status STRING,
  review_notes STRING,
  applied_to_production BOOL,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  
  -- Additional metadata
  tags ARRAY<STRING>,
  adk_session_id STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY project_id, template_id
OPTIONS(
  description="Stores BigQuery query optimization analysis results with complete stage data",
  labels=[("team", "data-engineering"), ("product", "bigquery-optimizer")]
)
"""

print('Creating new analyses table with updated schema...')
try:
    query_job = client.query(create_sql)
    query_job.result()
    print('Table created successfully!')
except Exception as e:
    print(f'Error creating table: {e}')