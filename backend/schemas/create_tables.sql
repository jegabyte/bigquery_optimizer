-- Create dataset if not exists
CREATE SCHEMA IF NOT EXISTS `aiva-e74f3.bq_optimizer`
OPTIONS(
  description="BigQuery Optimizer backend data storage",
  location="US"
);

-- Table: projects
CREATE TABLE IF NOT EXISTS `aiva-e74f3.bq_optimizer.projects` (
  project_id STRING NOT NULL,
  display_name STRING,
  analysis_window INT64 DEFAULT 30,
  regions ARRAY<STRING>,
  datasets ARRAY<STRING>,
  pricing_mode STRING DEFAULT 'on-demand',
  price_per_tb FLOAT64 DEFAULT 5.00,
  auto_detect_regions BOOL DEFAULT TRUE,
  auto_detect_datasets BOOL DEFAULT TRUE,
  is_active BOOL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  last_scan_at TIMESTAMP
);

-- Table: query_templates
CREATE TABLE IF NOT EXISTS `aiva-e74f3.bq_optimizer.query_templates` (
  template_id STRING NOT NULL,
  project_id STRING NOT NULL,
  template_hash STRING NOT NULL,
  sql_pattern STRING,
  full_sql STRING,
  tables_used ARRAY<STRING>,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  total_runs INT64 DEFAULT 0,
  total_bytes_processed INT64 DEFAULT 0,
  p50_bytes_processed INT64,
  p90_bytes_processed INT64,
  p99_bytes_processed INT64,
  avg_runtime_seconds FLOAT64,
  p50_runtime_seconds FLOAT64,
  p90_runtime_seconds FLOAT64,
  state STRING DEFAULT 'new',  -- new, analyzing, analyzed, optimized
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Table: template_runs
CREATE TABLE IF NOT EXISTS `aiva-e74f3.bq_optimizer.template_runs` (
  run_id STRING NOT NULL,
  template_id STRING NOT NULL,
  project_id STRING NOT NULL,
  job_id STRING,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  bytes_processed INT64,
  bytes_billed INT64,
  slot_ms INT64,
  runtime_seconds FLOAT64,
  user_email STRING,
  error_result STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Table: template_analyses
CREATE TABLE IF NOT EXISTS `aiva-e74f3.bq_optimizer.template_analyses` (
  analysis_id STRING NOT NULL,
  template_id STRING NOT NULL,
  project_id STRING NOT NULL,
  analysis_type STRING,  -- rules_check, rewrite, validate, full
  analysis_result JSON,
  compliance_score INT64,
  issues_found ARRAY<STRING>,
  optimized_sql STRING,
  estimated_savings_percent FLOAT64,
  recommendations JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  analyzed_by STRING
);

-- Table: analysis_jobs
CREATE TABLE IF NOT EXISTS `aiva-e74f3.bq_optimizer.analysis_jobs` (
  job_id STRING NOT NULL,
  project_id STRING NOT NULL,
  template_ids ARRAY<STRING>,
  analysis_type STRING,
  status STRING DEFAULT 'pending',  -- pending, running, completed, failed
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  results_summary JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);