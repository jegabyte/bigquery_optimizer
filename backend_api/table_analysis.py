"""
Table Analysis using INFORMATION_SCHEMA
Analyzes table storage, usage patterns, and optimization opportunities
"""

from google.cloud import bigquery
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import hashlib
import uuid
from config import config

def analyze_tables(
    client: bigquery.Client,
    project_id: str,
    custom_tables: Optional[Dict[str, str]] = None,
    analysis_window: int = 180  # 6 months default
) -> Dict[str, Any]:
    """
    Analyze tables using INFORMATION_SCHEMA for storage and usage metrics
    """
    
    # Use custom tables or defaults
    if custom_tables:
        jobs_by_project_table = custom_tables.get('jobs_by_project_table', f'{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT')
        table_storage_table = custom_tables.get('table_storage_table', f'{project_id}.region-us.INFORMATION_SCHEMA.TABLE_STORAGE')
        tables_table = custom_tables.get('tables_table', f'{project_id}.region-us.INFORMATION_SCHEMA.TABLES')
    else:
        jobs_by_project_table = f'{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT'
        table_storage_table = f'{project_id}.region-us.INFORMATION_SCHEMA.TABLE_STORAGE'
        tables_table = f'{project_id}.region-us.INFORMATION_SCHEMA.TABLES'
    
    # Remove backticks if present
    jobs_by_project_table = jobs_by_project_table.replace('`', '')
    table_storage_table = table_storage_table.replace('`', '')
    tables_table = tables_table.replace('`', '')
    
    query = f"""
    WITH 
    tables_metadata AS (
      SELECT
        table_catalog AS project_id,
        table_schema AS dataset_id,
        table_name,
        CONCAT(table_catalog, '.', table_schema, '.', table_name) AS full_table_name,
        table_type,
        creation_time AS table_creation_time,
        base_table_catalog,
        base_table_schema,
        base_table_name,
        ddl,

        -- Partition & cluster hints from DDL
        REGEXP_EXTRACT(ddl, r'PARTITION BY\\s+(?:DATE\\()?([^\\)\\s;]+)') AS partition_field,
        REGEXP_CONTAINS(ddl, r'PARTITION BY') AS is_partitioned,
        REGEXP_EXTRACT(ddl, r'CLUSTER BY\\s+([^;]+)') AS cluster_fields_raw,
        REGEXP_CONTAINS(ddl, r'CLUSTER BY') AS is_clustered,
        CASE 
          WHEN REGEXP_EXTRACT(ddl, r'CLUSTER BY\\s+([^;]+)') IS NOT NULL
          THEN ARRAY_LENGTH(SPLIT(REGEXP_EXTRACT(ddl, r'CLUSTER BY\\s+([^;]+)'), ','))
          ELSE 0
        END AS cluster_fields_count,

        REGEXP_CONTAINS(ddl, r'require_partition_filter\\s*=\\s*true') AS require_partition_filter,
        REGEXP_EXTRACT(ddl, r'partition_expiration_days\\s*=\\s*(\\d+)') AS partition_expiration_days,
        REGEXP_EXTRACT(ddl, r'description\\s*=\\s*"([^"]+)"') AS table_description,
        REGEXP_EXTRACT(ddl, r'kms_key_name\\s*=\\s*"([^"]+)"') AS kms_key_name

      FROM `{tables_table}`
      WHERE table_catalog = '{project_id}'
    ),

    storage_info AS (
      SELECT
        CONCAT(project_id, '.', table_schema, '.', table_name) AS full_table_name,
        SUM(total_logical_bytes) AS total_logical_bytes,
        SUM(total_physical_bytes) AS total_physical_bytes,
        SUM(active_logical_bytes) AS active_logical_bytes,
        SUM(long_term_logical_bytes) AS long_term_logical_bytes,
        SUM(time_travel_physical_bytes) AS time_travel_physical_bytes,
        SUM(total_rows) AS total_rows,

        COALESCE(ROUND(SUM(total_logical_bytes) / POW(2, 30), 2), 0) AS total_logical_gb,
        COALESCE(ROUND(SUM(total_physical_bytes) / POW(2, 30), 2), 0) AS total_physical_gb,
        COALESCE(ROUND(SUM(active_logical_bytes) / POW(2, 30), 2), 0) AS active_logical_gb,
        COALESCE(ROUND(SUM(long_term_logical_bytes) / POW(2, 30), 2), 0) AS long_term_logical_gb,
        COALESCE(ROUND(SUM(time_travel_physical_bytes) / POW(2, 30), 2), 0) AS time_travel_gb,

        COALESCE(ROUND((SUM(active_logical_bytes) / POW(2, 40)) * 20, 2), 0) AS active_storage_cost_monthly_usd,
        COALESCE(ROUND((SUM(long_term_logical_bytes) / POW(2, 40)) * 10, 2), 0) AS long_term_storage_cost_monthly_usd
      FROM `{table_storage_table}`
      WHERE project_id = '{project_id}'
      GROUP BY full_table_name
    ),

    query_usage AS (
      SELECT
        CONCAT(table_ref.project_id, '.', table_ref.dataset_id, '.', table_ref.table_id) AS full_table_name,
        COUNT(DISTINCT j.job_id) AS total_queries_6m,
        COUNT(DISTINCT j.user_email) AS unique_users_6m,
        COUNT(DISTINCT DATE(j.creation_time)) AS days_with_queries,
        COUNT(DISTINCT j.project_id) AS projects_accessing_table,

        COUNTIF(j.statement_type = 'SELECT') AS select_queries,
        COUNTIF(j.statement_type = 'INSERT') AS insert_queries,
        COUNTIF(j.statement_type = 'UPDATE') AS update_queries,
        COUNTIF(j.statement_type = 'DELETE') AS delete_queries,
        COUNTIF(j.statement_type = 'MERGE') AS merge_queries,

        COALESCE(SUM(j.total_bytes_billed), 0) AS total_bytes_billed,
        COALESCE(ROUND(SUM(j.total_bytes_billed) / POW(2, 40), 4), 0) AS total_tb_billed,
        COALESCE(ROUND(SUM(j.total_bytes_billed / POW(2,40)) * 5, 2), 0) AS total_query_cost_6m_usd,

        MAX(j.creation_time) AS last_queried_time
      FROM `{jobs_by_project_table}` j,
           UNNEST(j.referenced_tables) AS table_ref
      WHERE DATE(j.creation_time) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH) AND CURRENT_DATE()
        AND j.error_result IS NULL
      GROUP BY full_table_name
    )

    SELECT
      tm.project_id, tm.dataset_id, tm.table_name, tm.full_table_name,
      tm.table_type, tm.table_creation_time,
      TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), tm.table_creation_time, DAY) AS table_age_days,
      tm.table_description,

      tm.is_partitioned, tm.partition_field, tm.require_partition_filter,
      tm.partition_expiration_days, tm.is_clustered, tm.cluster_fields_raw,

      -- Storage metrics (null → 0)
      COALESCE(si.total_logical_gb, 0) AS total_logical_gb,
      COALESCE(si.active_logical_gb, 0) AS active_logical_gb,
      COALESCE(si.long_term_logical_gb, 0) AS long_term_logical_gb,
      COALESCE(si.active_storage_cost_monthly_usd, 0) AS active_storage_cost_monthly_usd,
      COALESCE(si.long_term_storage_cost_monthly_usd, 0) AS long_term_storage_cost_monthly_usd,

      -- Usage metrics (null → 0)
      COALESCE(qu.total_queries_6m, 0) AS total_queries_6m,
      COALESCE(qu.unique_users_6m, 0) AS unique_users_6m,
      COALESCE(qu.total_tb_billed, 0) AS total_tb_billed,
      COALESCE(qu.total_query_cost_6m_usd, 0) AS total_query_cost_6m_usd,

      -- Last queried timestamp stays nullable (never queried = NULL)
      qu.last_queried_time

    FROM tables_metadata tm
    LEFT JOIN storage_info si ON tm.full_table_name = si.full_table_name
    LEFT JOIN query_usage qu  ON tm.full_table_name = qu.full_table_name
    ORDER BY total_logical_gb DESC
    """
    
    try:
        # Execute the query
        query_job = client.query(query)
        results = list(query_job.result())
        
        tables = []
        total_storage_gb = 0
        total_storage_cost = 0
        total_query_cost = 0
        total_tables = 0
        unused_tables = 0
        
        for row in results:
            table_data = {
                "project_id": row.project_id,
                "dataset_id": row.dataset_id,
                "table_name": row.table_name,
                "full_table_name": row.full_table_name,
                "table_type": row.table_type,
                "table_creation_time": row.table_creation_time.isoformat() if row.table_creation_time else None,
                "table_age_days": row.table_age_days,
                "table_description": row.table_description,
                "is_partitioned": row.is_partitioned,
                "partition_field": row.partition_field,
                "require_partition_filter": row.require_partition_filter,
                "partition_expiration_days": row.partition_expiration_days,
                "is_clustered": row.is_clustered,
                "cluster_fields_raw": row.cluster_fields_raw,
                "total_logical_gb": float(row.total_logical_gb),
                "active_logical_gb": float(row.active_logical_gb),
                "long_term_logical_gb": float(row.long_term_logical_gb),
                "active_storage_cost_monthly_usd": float(row.active_storage_cost_monthly_usd),
                "long_term_storage_cost_monthly_usd": float(row.long_term_storage_cost_monthly_usd),
                "total_queries_6m": row.total_queries_6m,
                "unique_users_6m": row.unique_users_6m,
                "total_tb_billed": float(row.total_tb_billed),
                "total_query_cost_6m_usd": float(row.total_query_cost_6m_usd),
                "last_queried_time": row.last_queried_time.isoformat() if row.last_queried_time else None
            }
            
            tables.append(table_data)
            total_tables += 1
            total_storage_gb += table_data["total_logical_gb"]
            total_storage_cost += table_data["active_storage_cost_monthly_usd"] + table_data["long_term_storage_cost_monthly_usd"]
            total_query_cost += table_data["total_query_cost_6m_usd"]
            
            if table_data["total_queries_6m"] == 0:
                unused_tables += 1
        
        return {
            "success": True,
            "project_id": project_id,
            "tables": tables,
            "summary": {
                "total_tables": total_tables,
                "total_storage_gb": round(total_storage_gb, 2),
                "total_storage_cost_monthly": round(total_storage_cost, 2),
                "total_query_cost_6m": round(total_query_cost, 2),
                "unused_tables_count": unused_tables,
                "partitioned_tables": sum(1 for t in tables if t["is_partitioned"]),
                "clustered_tables": sum(1 for t in tables if t["is_clustered"])
            },
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "project_id": project_id
        }

def store_table_analysis(
    client: bigquery.Client,
    project_id: str,
    tables: List[Dict[str, Any]],
    scan_id: str = None
) -> bool:
    """Store table analysis results in BigQuery"""
    
    if not scan_id:
        scan_id = str(uuid.uuid4())
    
    table_id = config.get_full_table_id("table_analysis")
    
    rows_to_insert = []
    analysis_timestamp = datetime.utcnow().isoformat()
    
    for table in tables:
        rows_to_insert.append({
            "project_id": table["project_id"],
            "dataset_id": table["dataset_id"],
            "table_name": table["table_name"],
            "full_table_name": table["full_table_name"],
            "table_type": table.get("table_type"),
            "table_creation_time": table.get("table_creation_time"),
            "table_age_days": table.get("table_age_days"),
            "table_description": table.get("table_description"),
            "is_partitioned": table.get("is_partitioned"),
            "partition_field": table.get("partition_field"),
            "require_partition_filter": table.get("require_partition_filter"),
            "partition_expiration_days": table.get("partition_expiration_days"),
            "is_clustered": table.get("is_clustered"),
            "cluster_fields_raw": table.get("cluster_fields_raw"),
            "total_logical_gb": table.get("total_logical_gb", 0),
            "active_logical_gb": table.get("active_logical_gb", 0),
            "long_term_logical_gb": table.get("long_term_logical_gb", 0),
            "active_storage_cost_monthly_usd": table.get("active_storage_cost_monthly_usd", 0),
            "long_term_storage_cost_monthly_usd": table.get("long_term_storage_cost_monthly_usd", 0),
            "total_queries_6m": table.get("total_queries_6m", 0),
            "unique_users_6m": table.get("unique_users_6m", 0),
            "total_tb_billed": table.get("total_tb_billed", 0),
            "total_query_cost_6m_usd": table.get("total_query_cost_6m_usd", 0),
            "last_queried_time": table.get("last_queried_time"),
            "analysis_timestamp": analysis_timestamp,
            "scan_id": scan_id
        })
    
    if rows_to_insert:
        try:
            table = client.get_table(table_id)
            errors = client.insert_rows_json(table, rows_to_insert)
            
            if errors:
                print(f"Failed to insert table analysis: {errors}")
                return False
            
            return True
        except Exception as e:
            print(f"Error storing table analysis: {e}")
            return False
    
    return True