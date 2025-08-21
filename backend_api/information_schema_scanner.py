"""
Information Schema based project scanner for BigQuery Optimizer
Uses INFORMATION_SCHEMA.JOBS or JOBS_BY_PROJECT to analyze query patterns
"""

from google.cloud import bigquery
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import hashlib
import re
import json
from config import config

def check_information_schema_access(client: bigquery.Client, project_id: str) -> Dict[str, bool]:
    """Check access to various INFORMATION_SCHEMA tables"""
    permissions = {
        "information_schema_jobs": False,
        "information_schema_jobs_by_project": False,
        "bigquery_data_viewer": False,
        "bigquery_job_user": False
    }
    
    # Check INFORMATION_SCHEMA.JOBS access
    try:
        test_query = f"""
        SELECT COUNT(*) as count
        FROM `{project_id}.region-us.INFORMATION_SCHEMA.JOBS`
        WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
        LIMIT 1
        """
        client.query(test_query).result()
        permissions["information_schema_jobs"] = True
    except:
        pass
    
    # Check INFORMATION_SCHEMA.JOBS_BY_PROJECT access
    try:
        test_query = f"""
        SELECT COUNT(*) as count
        FROM `{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
        WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
        LIMIT 1
        """
        client.query(test_query).result()
        permissions["information_schema_jobs_by_project"] = True
    except:
        pass
    
    # Check if we can query tables (BigQuery Data Viewer)
    try:
        test_query = f"""
        SELECT table_name
        FROM `{project_id}.region-us.INFORMATION_SCHEMA.TABLES`
        LIMIT 1
        """
        client.query(test_query).result()
        permissions["bigquery_data_viewer"] = True
    except:
        pass
    
    # Check if we can create jobs (BigQuery Job User)
    try:
        test_query = f"SELECT 1"
        job_config = bigquery.QueryJobConfig(dry_run=True)
        client.query(test_query, job_config=job_config).result()
        permissions["bigquery_job_user"] = True
    except:
        pass
    
    return permissions

def validate_project_access(client: bigquery.Client, project_id: str, analysis_window: Any, custom_tables: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Validate project access and return basic stats"""
    
    # Determine the date range
    if isinstance(analysis_window, dict):
        start_date = analysis_window.get('startDate')
        end_date = analysis_window.get('endDate')
    else:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=analysis_window)).strftime('%Y-%m-%d')
    
    # Determine which table to use
    if custom_tables and custom_tables.get('jobs_table'):
        tables_to_try = [custom_tables['jobs_table']]
        if custom_tables.get('jobs_by_project_table'):
            tables_to_try.append(custom_tables['jobs_by_project_table'])
    else:
        tables_to_try = [
            f"{project_id}.region-us.INFORMATION_SCHEMA.JOBS",
            f"{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT"
        ]
    
    # Try each table
    for table in tables_to_try:
        try:
            query = f"""
            SELECT COUNT(*) as job_count,
                   COUNT(DISTINCT query_info.query_hashes.normalized_literals) as template_count
            FROM `{table}`
            WHERE DATE(creation_time) BETWEEN '{start_date}' AND '{end_date}'
              AND statement_type = 'SELECT'
              AND error_result IS NULL
            """
            result = client.query(query).result()
            row = list(result)[0]
            
            return {
                "success": True,
                "jobsFound": row.job_count,
                "estimatedTemplates": row.template_count,
                "source": table
            }
        except:
            continue
    
    # If none of the tables worked
    return {
        "success": False,
        "error": "Could not access any INFORMATION_SCHEMA tables",
        "jobsFound": 0,
        "estimatedTemplates": 0
    }

def scan_project_with_information_schema(
    client: bigquery.Client,
    project_id: str,
    analysis_window: Any,
    price_per_tb: float = 5.0,
    custom_tables: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Scan project using INFORMATION_SCHEMA to discover query templates
    Returns analysis results including top cost drivers
    """
    
    # Determine the date range
    if isinstance(analysis_window, dict):
        start_date = f"PARSE_DATE('%Y-%m-%d', '{analysis_window.get('startDate')}')"
        end_date = f"PARSE_DATE('%Y-%m-%d', '{analysis_window.get('endDate')}')"
    else:
        end_date = "CURRENT_DATE()"
        start_date = f"DATE_SUB(CURRENT_DATE(), INTERVAL {analysis_window} DAY)"
    
    # Determine which INFORMATION_SCHEMA table to use
    if custom_tables and custom_tables.get('jobs_table'):
        # Use custom table if specified
        info_schema_table = f"`{custom_tables['jobs_table']}`"
    else:
        # Default behavior - try JOBS first, then JOBS_BY_PROJECT
        info_schema_table = f"`{project_id}.region-us.INFORMATION_SCHEMA.JOBS`"
        
        # Check if JOBS is accessible, otherwise try JOBS_BY_PROJECT
        try:
            test_query = f"SELECT 1 FROM {info_schema_table} LIMIT 1"
            client.query(test_query).result()
        except:
            if custom_tables and custom_tables.get('jobs_by_project_table'):
                info_schema_table = f"`{custom_tables['jobs_by_project_table']}`"
            else:
                info_schema_table = f"`{project_id}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`"
    
    # Run the comprehensive query analysis
    query = f"""
    WITH query_metrics AS (
      SELECT
        query_info.query_hashes.normalized_literals AS query_hash,
        job_id,
        user_email,
        project_id,
        creation_time,
        query,
        total_bytes_billed,
        total_slot_ms,
        total_bytes_processed,
        cache_hit,
        TIMESTAMP_DIFF(end_time, start_time, SECOND) AS duration_seconds,
        (total_bytes_billed / POW(2, 40)) * {price_per_tb} AS estimated_cost_usd,
        referenced_tables
      FROM
        {info_schema_table}
      WHERE
        DATE(creation_time) BETWEEN {start_date} AND {end_date}
        AND statement_type = 'SELECT'
        AND error_result IS NULL
        AND total_bytes_billed > 0
    ),
    query_template_aggregates AS (
      SELECT
        query_hash,
        ANY_VALUE(query) AS sample_query,
        COUNT(*) AS execution_count,
        COUNT(DISTINCT user_email) AS unique_users,
        SUM(estimated_cost_usd) AS total_cost_usd,
        AVG(estimated_cost_usd) AS avg_cost_usd,
        MAX(estimated_cost_usd) AS max_cost_usd,
        MIN(estimated_cost_usd) AS min_cost_usd,
        STDDEV(estimated_cost_usd) AS stddev_cost_usd,
        SUM(total_bytes_billed) / POW(2, 40) AS total_tb_billed,
        AVG(total_bytes_billed) / POW(2, 30) AS avg_gb_billed,
        SUM(total_slot_ms) / 1000 AS total_slot_seconds,
        AVG(duration_seconds) AS avg_duration_seconds,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) AS cache_hits,
        ARRAY_AGG(DISTINCT user_email IGNORE NULLS ORDER BY user_email LIMIT 10) AS top_users,
        ARRAY_AGG(job_id ORDER BY estimated_cost_usd DESC LIMIT 5) AS expensive_job_ids,
        MIN(creation_time) AS first_executed,
        MAX(creation_time) AS last_executed
      FROM
        query_metrics
      WHERE
        query_hash IS NOT NULL
      GROUP BY
        query_hash
    ),
    impactful_templates AS (
      SELECT
        *,
        (total_cost_usd * LN(execution_count + 1)) AS impact_score,
        ROUND(cache_hits * 100.0 / execution_count, 1) AS cache_hit_rate,
        CASE
          WHEN total_cost_usd > 100 OR (execution_count > 500 AND avg_cost_usd > 1) THEN 'CRITICAL'
          WHEN total_cost_usd > 50 OR (execution_count > 100 AND avg_cost_usd > 0.5) THEN 'HIGH'
          WHEN total_cost_usd > 10 OR (execution_count > 50 AND avg_cost_usd > 0.1) THEN 'MEDIUM'
          ELSE 'LOW'
        END AS priority_level
      FROM
        query_template_aggregates
    )
    SELECT
      query_hash,
      sample_query,
      execution_count,
      unique_users,
      ROUND(total_cost_usd, 2) AS total_cost_usd,
      ROUND(avg_cost_usd, 4) AS avg_cost_usd,
      ROUND(max_cost_usd, 4) AS max_cost_usd,
      ROUND(min_cost_usd, 4) AS min_cost_usd,
      ROUND(stddev_cost_usd, 4) AS cost_variance,
      ROUND(total_tb_billed, 4) AS total_tb_billed,
      ROUND(avg_gb_billed, 4) AS avg_gb_billed,
      ROUND(total_slot_seconds, 2) AS total_slot_seconds,
      ROUND(avg_duration_seconds, 2) AS avg_duration_seconds,
      cache_hit_rate,
      priority_level,
      ROUND(impact_score, 2) AS impact_score,
      top_users,
      expensive_job_ids,
      first_executed,
      last_executed
    FROM
      impactful_templates
    WHERE
      priority_level IN ('CRITICAL', 'HIGH', 'MEDIUM')
    ORDER BY
      total_cost_usd DESC
    LIMIT 200
    """
    
    try:
        # Execute the query
        query_job = client.query(query)
        results = query_job.result()
        
        templates = []
        total_cost = 0
        total_queries = 0
        
        for row in results:
            template = {
                "template_id": hashlib.md5(row.query_hash.encode()).hexdigest()[:16],
                "query_hash": row.query_hash,
                "sample_query": row.sample_query,
                "execution_count": row.execution_count,
                "unique_users": row.unique_users,
                "total_cost_usd": float(row.total_cost_usd),
                "avg_cost_usd": float(row.avg_cost_usd),
                "max_cost_usd": float(row.max_cost_usd),
                "min_cost_usd": float(row.min_cost_usd),
                "cost_variance": float(row.cost_variance) if row.cost_variance else 0,
                "total_tb_billed": float(row.total_tb_billed),
                "avg_gb_billed": float(row.avg_gb_billed),
                "total_slot_seconds": float(row.total_slot_seconds),
                "avg_duration_seconds": float(row.avg_duration_seconds),
                "cache_hit_rate": float(row.cache_hit_rate) if row.cache_hit_rate else 0,
                "priority_level": row.priority_level,
                "impact_score": float(row.impact_score),
                "top_users": list(row.top_users) if row.top_users else [],
                "expensive_job_ids": list(row.expensive_job_ids) if row.expensive_job_ids else [],
                "first_executed": row.first_executed.isoformat() if row.first_executed else None,
                "last_executed": row.last_executed.isoformat() if row.last_executed else None
            }
            
            templates.append(template)
            total_cost += template["total_cost_usd"]
            total_queries += template["execution_count"]
        
        return {
            "success": True,
            "project_id": project_id,
            "templates_discovered": len(templates),
            "total_queries_analyzed": total_queries,
            "total_cost_analyzed": round(total_cost, 2),
            "templates": templates,
            "source": "INFORMATION_SCHEMA",
            "analysis_period": {
                "start": start_date,
                "end": end_date
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "templates_discovered": 0,
            "templates": []
        }

def store_templates_in_bigquery(
    client: bigquery.Client,
    project_id: str,
    templates: List[Dict[str, Any]],
    analysis_metadata: Dict[str, Any]
) -> bool:
    """Store discovered templates in BigQuery for persistence"""
    
    table_id = config.get_full_table_id("query_templates")
    
    rows_to_insert = []
    for template in templates:
        rows_to_insert.append({
            "template_id": template["template_id"],
            "project_id": project_id,
            "template_hash": template["query_hash"],
            "sql_pattern": template["sample_query"][:10000],  # Limit to 10K chars
            "full_sql": template["sample_query"],
            # Don't include execution_count - not a column in the table
            # "unique_users": template["unique_users"],  # Not in table schema
            # "total_cost_usd": template["total_cost_usd"],  # Not in table schema
            # "avg_cost_usd": template["avg_cost_usd"],  # Not in table schema
            # "total_tb_billed": template["total_tb_billed"],  # Not in table schema
            # "avg_gb_billed": template["avg_gb_billed"],  # Not in table schema
            # "cache_hit_rate": template["cache_hit_rate"],  # Not in table schema
            # "priority_level": template["priority_level"],  # Not in table schema
            # "impact_score": template["impact_score"],  # Not in table schema
            "first_seen": template["first_executed"],
            "last_seen": template["last_executed"],
            "total_runs": template["execution_count"],
            "total_bytes_processed": int(template["total_tb_billed"] * 1099511627776),  # Convert TB to bytes
            "avg_runtime_seconds": template["avg_duration_seconds"],
            "p50_bytes_processed": int(template.get("avg_gb_billed", 0) * 1073741824),  # Approx
            "p90_bytes_processed": int(template.get("max_cost_usd", 0) / 5.0 * 1099511627776),  # Approx
            "state": "discovered",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "metadata": json.dumps({
                "top_users": template["top_users"],
                "expensive_job_ids": template["expensive_job_ids"],
                "cost_variance": template["cost_variance"],
                "unique_users": template["unique_users"],
                "total_cost_usd": template["total_cost_usd"],
                "avg_cost_usd": template["avg_cost_usd"],
                "cache_hit_rate": template["cache_hit_rate"],
                "priority_level": template["priority_level"],
                "impact_score": template["impact_score"],
                "analysis_metadata": analysis_metadata
            })
        })
    
    if rows_to_insert:
        try:
            table = client.get_table(table_id)
            errors = client.insert_rows_json(table, rows_to_insert)
            
            if errors:
                print(f"Failed to insert templates: {errors}")
                return False
            
            return True
        except Exception as e:
            print(f"Error storing templates: {e}")
            return False
    
    return True