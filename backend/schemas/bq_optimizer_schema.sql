-- ================================================================
-- BigQuery Optimizer - Backend Data Schema
-- Dataset: bq_optimizer
-- ================================================================

-- Create dataset if not exists
CREATE SCHEMA IF NOT EXISTS `bq_optimizer`
OPTIONS(
  description="BigQuery Optimizer backend data storage",
  location="US"
);

-- ================================================================
-- Table: projects
-- Stores integrated GCP projects configuration
-- ================================================================
CREATE TABLE IF NOT EXISTS `bq_optimizer.projects` (
  project_id STRING NOT NULL,
  display_name STRING,
  analysis_window INT64 DEFAULT 30,
  regions ARRAY<STRING>,
  datasets ARRAY<STRING>,
  pricing_mode STRING DEFAULT 'on-demand',
  price_per_tb NUMERIC DEFAULT 5.00,
  auto_detect_regions BOOL DEFAULT true,
  auto_detect_datasets BOOL DEFAULT true,
  is_active BOOL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  last_scan_at TIMESTAMP,
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY project_id;

-- ================================================================
-- Table: query_templates
-- Stores unique query patterns discovered from projects
-- ================================================================
CREATE TABLE IF NOT EXISTS `bq_optimizer.query_templates` (
  template_id STRING NOT NULL,
  project_id STRING NOT NULL,
  template_hash STRING NOT NULL,
  sql_pattern STRING,
  full_sql STRING,
  tables_used ARRAY<STRING>,
  datasets_used ARRAY<STRING>,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  total_runs INT64 DEFAULT 0,
  total_bytes_processed INT64 DEFAULT 0,
  avg_runtime_seconds NUMERIC,
  p50_bytes_processed INT64,
  p90_bytes_processed INT64,
  p99_bytes_processed INT64,
  p50_runtime_seconds NUMERIC,
  p90_runtime_seconds NUMERIC,
  state STRING DEFAULT 'new', -- new, analyzed, validated, applied, snoozed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY project_id, template_hash;

-- ================================================================
-- Table: template_runs
-- Stores individual query executions for each template
-- ================================================================
CREATE TABLE IF NOT EXISTS `bq_optimizer.template_runs` (
  run_id STRING NOT NULL,
  template_id STRING NOT NULL,
  project_id STRING NOT NULL,
  job_id STRING,
  user_email STRING,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  bytes_processed INT64,
  bytes_billed INT64,
  slot_ms INT64,
  runtime_seconds NUMERIC,
  estimated_cost NUMERIC,
  error_message STRING,
  labels JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(start_time)
CLUSTER BY project_id, template_id;

-- ================================================================
-- Table: template_analyses
-- Stores analysis results for each template
-- ================================================================
CREATE TABLE IF NOT EXISTS `bq_optimizer.template_analyses` (
  analysis_id STRING NOT NULL,
  template_id STRING NOT NULL,
  project_id STRING NOT NULL,
  analysis_type STRING, -- rules_only, rules_rewrite, rules_rewrite_validate
  ruleset_version STRING,
  compliance_score INT64,
  total_issues INT64,
  critical_issues INT64,
  issues JSON, -- Array of issue objects
  optimized_sql STRING,
  optimization_steps JSON, -- Array of optimization steps
  estimated_bytes_before INT64,
  estimated_bytes_after INT64,
  estimated_cost_before NUMERIC,
  estimated_cost_after NUMERIC,
  savings_percentage NUMERIC,
  recommendations JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY project_id, template_id;

-- ================================================================
-- Table: project_stats
-- Aggregated statistics per project (materialized view)
-- ================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS `bq_optimizer.project_stats` AS
SELECT
  p.project_id,
  p.display_name,
  p.analysis_window,
  COUNT(DISTINCT t.template_id) as templates_discovered,
  SUM(t.total_runs) as total_runs,
  SUM(t.total_bytes_processed) / POW(10, 12) as total_tb_processed,
  SUM(t.total_bytes_processed) / POW(10, 12) * p.price_per_tb as estimated_monthly_spend,
  AVG(a.compliance_score) as avg_compliance_score,
  SUM(CASE WHEN a.savings_percentage > 0 THEN 
    (a.estimated_cost_before - a.estimated_cost_after) * t.total_runs / p.analysis_window * 30
    ELSE 0 END) as potential_monthly_savings,
  MAX(t.last_seen) as last_activity,
  CURRENT_TIMESTAMP() as refreshed_at
FROM `bq_optimizer.projects` p
LEFT JOIN `bq_optimizer.query_templates` t ON p.project_id = t.project_id
LEFT JOIN (
  SELECT template_id, project_id, 
         MAX(compliance_score) as compliance_score,
         MAX(savings_percentage) as savings_percentage,
         MAX(estimated_cost_before) as estimated_cost_before,
         MAX(estimated_cost_after) as estimated_cost_after
  FROM `bq_optimizer.template_analyses`
  WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  GROUP BY template_id, project_id
) a ON t.template_id = a.template_id
WHERE p.is_active = true
GROUP BY p.project_id, p.display_name, p.analysis_window, p.price_per_tb;

-- ================================================================
-- Table: top_cost_drivers
-- Top expensive queries per project (materialized view)
-- ================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS `bq_optimizer.top_cost_drivers` AS
WITH ranked_templates AS (
  SELECT
    project_id,
    template_id,
    sql_pattern,
    tables_used,
    total_runs,
    total_bytes_processed,
    (total_bytes_processed / POW(10, 12)) * 5.00 as estimated_cost,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY total_bytes_processed DESC) as rank
  FROM `bq_optimizer.query_templates`
  WHERE last_seen >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
)
SELECT
  project_id,
  template_id,
  SUBSTR(sql_pattern, 1, 100) as query_snippet,
  tables_used[SAFE_OFFSET(0)] as primary_table,
  total_runs,
  ROUND(total_bytes_processed / POW(10, 9), 2) as gb_processed,
  ROUND(estimated_cost, 2) as estimated_cost,
  rank
FROM ranked_templates
WHERE rank <= 10;

-- ================================================================
-- Table: analysis_jobs
-- Tracks background analysis jobs
-- ================================================================
CREATE TABLE IF NOT EXISTS `bq_optimizer.analysis_jobs` (
  job_id STRING NOT NULL,
  project_id STRING,
  job_type STRING, -- project_scan, bulk_analysis, single_analysis
  status STRING DEFAULT 'queued', -- queued, running, completed, failed
  templates_to_process INT64,
  templates_processed INT64 DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message STRING,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_by STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY project_id, status;