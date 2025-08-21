-- Drop existing table if exists
DROP TABLE IF EXISTS `aiva-e74f3.bq_optimizer.analyses`;

-- Create analyses table in BigQuery with complete schema
-- This table stores all optimization analysis results including stage data

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
  analysis_type STRING, -- 'manual', 'automated', 'scheduled', 'optimization'
  analysis_status STRING, -- 'pending', 'in_progress', 'completed', 'failed'
  
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
  validation_status STRING, -- 'passed', 'failed', 'skipped'
  validation_errors ARRAY<STRING>,
  dry_run_successful BOOL,
  
  -- Stage Data - Store each stage's complete data
  stage_metadata JSON, -- Metadata extraction stage results
  stage_rules JSON, -- Rule analysis stage results  
  stage_optimization JSON, -- Query optimization stage results
  stage_report JSON, -- Final report stage results
  
  -- Complete analysis result from ADK
  adk_response JSON, -- Full response from ADK including all metadata
  
  -- User interaction
  created_by STRING,
  reviewed_by STRING,
  review_status STRING, -- 'pending_review', 'approved', 'rejected'
  review_notes STRING,
  applied_to_production BOOL,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  
  -- Additional metadata
  tags ARRAY<STRING>,
  adk_session_id STRING,
  
  PRIMARY KEY (analysis_id) NOT ENFORCED
)
PARTITION BY DATE(created_at)
CLUSTER BY project_id, template_id
OPTIONS(
  description="Stores BigQuery query optimization analysis results with complete stage data",
  labels=[("team", "data-engineering"), ("product", "bigquery-optimizer")]
);

-- Create index for faster queries (if needed)
-- BigQuery doesn't support traditional indexes, but clustering provides similar benefits

-- Sample insert for testing
/*
INSERT INTO `aiva-e74f3.bq_optimizer.analyses` (
  analysis_id,
  template_id,
  project_id,
  original_query,
  query_hash,
  analysis_type,
  analysis_status,
  issues_found,
  optimized_query,
  optimization_applied,
  original_bytes_processed,
  optimized_bytes_processed,
  bytes_saved,
  cost_saved_usd,
  savings_percentage,
  created_by,
  created_at
) VALUES (
  GENERATE_UUID(),
  'tmpl_12345678',
  'aiva-e74f3',
  'SELECT * FROM table WHERE date = "2024-01-01"',
  MD5('SELECT * FROM table WHERE date = "2024-01-01"'),
  'manual',
  'completed',
  [
    STRUCT(
      'ANTI_001' AS rule_id,
      'SELECT_STAR' AS rule_name,
      'HIGH' AS severity,
      'Query uses SELECT * which reads all columns' AS description,
      'Increases data scanned and costs' AS impact,
      'Specify only required columns' AS suggestion
    )
  ],
  'SELECT col1, col2 FROM table WHERE date = "2024-01-01"',
  TRUE,
  1000000000,
  500000000,
  500000000,
  2.50,
  50.0,
  'user@example.com',
  CURRENT_TIMESTAMP()
);
*/