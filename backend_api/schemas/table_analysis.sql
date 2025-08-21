-- Table for storing table analysis results
CREATE TABLE IF NOT EXISTS `aiva-e74f3.bq_optimizer.table_analysis` (
  project_id STRING NOT NULL,
  dataset_id STRING NOT NULL,
  table_name STRING NOT NULL,
  full_table_name STRING NOT NULL,
  table_type STRING,
  table_creation_time TIMESTAMP,
  table_age_days INT64,
  table_description STRING,
  
  -- Partitioning and clustering info
  is_partitioned BOOL,
  partition_field STRING,
  require_partition_filter BOOL,
  partition_expiration_days STRING,
  is_clustered BOOL,
  cluster_fields_raw STRING,
  
  -- Storage metrics
  total_logical_gb FLOAT64,
  active_logical_gb FLOAT64,
  long_term_logical_gb FLOAT64,
  active_storage_cost_monthly_usd FLOAT64,
  long_term_storage_cost_monthly_usd FLOAT64,
  
  -- Usage metrics
  total_queries_6m INT64,
  unique_users_6m INT64,
  total_tb_billed FLOAT64,
  total_query_cost_6m_usd FLOAT64,
  last_queried_time TIMESTAMP,
  
  -- Metadata
  analysis_timestamp TIMESTAMP NOT NULL,
  scan_id STRING
)
PARTITION BY DATE(analysis_timestamp)
CLUSTER BY project_id, dataset_id;