"""
BigQuery Rules Fetcher for Agent API
Fetches anti-pattern rules from BigQuery table
"""

import os
import logging
import yaml
from google.cloud import bigquery
from typing import Optional
import json

logger = logging.getLogger(__name__)

def fetch_rules_from_bigquery(project_id: Optional[str] = None) -> str:
    """
    Fetch anti-pattern rules from BigQuery and convert to YAML format
    for compatibility with existing agents
    """
    try:
        # Get project ID from environment or use provided
        if not project_id:
            project_id = os.getenv('BQ_PROJECT_ID', os.getenv('GCP_PROJECT_ID', 'aiva-e74f3'))
        
        dataset_id = os.getenv('BQ_DATASET', 'bq_optimizer')
        table_id = f"{project_id}.{dataset_id}.bq_anti_pattern_rules"
        
        # Initialize BigQuery client
        client = bigquery.Client(project=project_id)
        
        # Query to fetch all active rules
        query = f"""
        SELECT 
            rule_id as id,
            title,
            description,
            severity,
            enabled,
            detect_pattern as detect,
            fix_suggestion as fix,
            category,
            impact,
            tags
        FROM `{table_id}`
        WHERE enabled = true
        ORDER BY severity DESC, rule_id
        """
        
        try:
            # Execute query
            query_job = client.query(query)
            results = list(query_job)
            
            if not results:
                logger.warning("No rules found in BigQuery, using defaults")
                return get_default_rules()
            
            # Convert to YAML format
            rules_dict = {
                'version': 2,
                'rules': []
            }
            
            for row in results:
                rule = {
                    'id': row.id,
                    'title': row.title,
                    'severity': row.severity,
                    'enabled': row.enabled,
                    'detect': row.detect or row.description,
                    'fix': row.fix or 'Review and optimize query'
                }
                
                # Add optional fields if they exist
                if row.category:
                    rule['category'] = row.category
                if row.impact:
                    rule['impact'] = row.impact
                if row.tags:
                    rule['tags'] = row.tags.split(',') if isinstance(row.tags, str) else row.tags
                
                rules_dict['rules'].append(rule)
            
            # Convert to YAML string
            yaml_content = yaml.dump(rules_dict, default_flow_style=False, sort_keys=False)
            logger.info(f"✅ Loaded {len(results)} BigQuery anti-pattern rules from {table_id}")
            return yaml_content
            
        except Exception as query_error:
            # Table might not exist, try to create it
            if "Not found: Table" in str(query_error):
                logger.info(f"Table {table_id} not found, creating with default rules...")
                create_rules_table(client, table_id)
                return get_default_rules()
            else:
                raise query_error
                
    except Exception as e:
        logger.error(f"❌ Failed to load rules from BigQuery: {e}")
        logger.info("Falling back to default rules")
        return get_default_rules()

def create_rules_table(client: bigquery.Client, table_id: str):
    """Create the rules table with default rules"""
    try:
        # Create table schema
        schema = [
            bigquery.SchemaField("rule_id", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("title", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("description", "STRING"),
            bigquery.SchemaField("severity", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("category", "STRING"),
            bigquery.SchemaField("enabled", "BOOLEAN", mode="REQUIRED"),
            bigquery.SchemaField("detect_pattern", "STRING"),
            bigquery.SchemaField("fix_suggestion", "STRING"),
            bigquery.SchemaField("impact", "STRING"),
            bigquery.SchemaField("tags", "STRING"),
            bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("updated_at", "TIMESTAMP"),
        ]
        
        table = bigquery.Table(table_id, schema=schema)
        table = client.create_table(table)
        logger.info(f"Created table {table_id}")
        
        # Insert default rules with proper timestamp
        from datetime import datetime
        current_time = datetime.utcnow().isoformat()
        
        default_rules = [
            {
                "rule_id": "NO_SELECT_STAR",
                "title": "Avoid SELECT *",
                "description": "Wildcard projections scan all columns",
                "severity": "high",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "Flag wildcard projection (* or t.*) except COUNT(*), * EXCEPT(...), or * REPLACE(...).",
                "fix_suggestion": "Select only required columns.",
                "impact": "Reduces data scanned and costs",
                "tags": "performance,cost",
                "created_at": current_time,
            },
            {
                "rule_id": "MISSING_PARTITION_FILTER",
                "title": "Missing partition filter",
                "description": "Partitioned table without filter scans all partitions",
                "severity": "critical",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "Partitioned table read without a WHERE on its partition column.",
                "fix_suggestion": "Add a constant/param range filter on the partition column.",
                "impact": "Can reduce data scanned by 90%+",
                "tags": "performance,cost,partitioning",
                "created_at": current_time,
            },
            {
                "rule_id": "MISSING_CLUSTER_FILTER",
                "title": "Missing clustering filter",
                "description": "Clustered table without clustering column filter",
                "severity": "medium",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "Clustered table without WHERE clause on clustering columns.",
                "fix_suggestion": "Filter by clustering columns for better performance.",
                "impact": "Improves query performance",
                "tags": "performance,clustering",
                "created_at": current_time,
            },
            {
                "rule_id": "LARGE_SORT_WITHOUT_LIMIT",
                "title": "Large sort without LIMIT",
                "description": "Sorting large results without limiting output",
                "severity": "medium",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "ORDER BY without LIMIT on large tables.",
                "fix_suggestion": "Add LIMIT clause or use approximate algorithms.",
                "impact": "Reduces memory usage",
                "tags": "performance,memory",
                "created_at": current_time,
            },
            {
                "rule_id": "CROSS_JOIN_WITHOUT_WHERE",
                "title": "Cross join without WHERE",
                "description": "Cross join can create cartesian products",
                "severity": "critical",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "CROSS JOIN or implicit cross join without WHERE clause.",
                "fix_suggestion": "Add WHERE conditions or use proper JOIN.",
                "impact": "Prevents query explosion",
                "tags": "performance,joins",
                "created_at": current_time,
            },
            {
                "rule_id": "EXCESSIVE_WILDCARD_TABLES",
                "title": "Excessive wildcard table usage",
                "description": "Query spans too many wildcard tables",
                "severity": "high",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "Wildcard table query without _TABLE_SUFFIX filter.",
                "fix_suggestion": "Filter _TABLE_SUFFIX by equality or bounded range.",
                "impact": "Reduces tables scanned",
                "tags": "performance,cost,wildcard",
                "created_at": current_time,
            },
            {
                "rule_id": "SUBQUERY_IN_WHERE",
                "title": "Subquery in WHERE clause",
                "description": "Subquery in WHERE can be inefficient",
                "severity": "medium",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "Subquery in WHERE clause instead of JOIN.",
                "fix_suggestion": "Use JOIN instead of subquery for better performance.",
                "impact": "Improves query execution",
                "tags": "performance,subquery",
                "created_at": current_time,
            },
            {
                "rule_id": "MISSING_TABLE_EXPIRATION",
                "title": "Missing table expiration",
                "description": "Temporary tables should have expiration",
                "severity": "low",
                "category": "Storage",
                "enabled": True,
                "detect_pattern": "Temporary or staging tables without expiration.",
                "fix_suggestion": "Set table expiration for temporary tables.",
                "impact": "Reduces storage costs",
                "tags": "storage,cost",
                "created_at": current_time,
            },
            {
                "rule_id": "INEFFICIENT_REGEX",
                "title": "Inefficient regex pattern",
                "description": "Unbounded regex patterns are slow",
                "severity": "medium",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "REGEXP_EXTRACT or REGEXP_CONTAINS with unbounded patterns.",
                "fix_suggestion": "Use anchored patterns or LIKE when possible.",
                "impact": "Improves string matching performance",
                "tags": "performance,regex",
                "created_at": current_time,
            },
            {
                "rule_id": "UNNECESSARY_GROUPBY_COLUMNS",
                "title": "Unnecessary GROUP BY columns",
                "description": "Grouping by unused columns",
                "severity": "low",
                "category": "Performance",
                "enabled": True,
                "detect_pattern": "GROUP BY with columns not in SELECT.",
                "fix_suggestion": "Only group by necessary columns.",
                "impact": "Reduces processing overhead",
                "tags": "performance,groupby",
                "created_at": current_time,
            }
        ]
        
        # Insert rows
        errors = client.insert_rows_json(table_id, default_rules)
        if errors:
            logger.error(f"Failed to insert default rules: {errors}")
        else:
            logger.info(f"Inserted {len(default_rules)} default rules")
            
    except Exception as e:
        logger.error(f"Failed to create rules table: {e}")

def get_default_rules() -> str:
    """Return default rules in YAML format"""
    return """version: 2
rules:
  - id: NO_SELECT_STAR
    title: "Avoid SELECT *"
    severity: high
    enabled: true
    detect: "Flag wildcard projection (* or t.*) except COUNT(*), * EXCEPT(...), or * REPLACE(...)."
    fix: "Select only required columns."
    category: Performance
    impact: "Reduces data scanned and costs"
    
  - id: MISSING_PARTITION_FILTER
    title: "Missing partition filter"
    severity: critical
    enabled: true
    detect: "Partitioned table read without a WHERE on its partition column."
    fix: "Add a constant/param range filter on the partition column."
    category: Performance
    impact: "Can reduce data scanned by 90%+"
    
  - id: MISSING_CLUSTER_FILTER
    title: "Missing clustering filter"
    severity: medium
    enabled: true
    detect: "Clustered table without WHERE clause on clustering columns."
    fix: "Filter by clustering columns for better performance."
    category: Performance
    
  - id: LARGE_SORT_WITHOUT_LIMIT
    title: "Large sort without LIMIT"
    severity: medium
    enabled: true
    detect: "ORDER BY without LIMIT on large tables."
    fix: "Add LIMIT clause or use approximate algorithms."
    category: Performance
    
  - id: CROSS_JOIN_WITHOUT_WHERE
    title: "Cross join without WHERE"
    severity: critical
    enabled: true
    detect: "CROSS JOIN or implicit cross join without WHERE clause."
    fix: "Add WHERE conditions or use proper JOIN."
    category: Performance
    
  - id: EXCESSIVE_WILDCARD_TABLES
    title: "Excessive wildcard table usage"
    severity: high
    enabled: true
    detect: "Wildcard table query without _TABLE_SUFFIX filter."
    fix: "Filter _TABLE_SUFFIX by equality or bounded range."
    category: Performance
    
  - id: SUBQUERY_IN_WHERE
    title: "Subquery in WHERE clause"
    severity: medium
    enabled: true
    detect: "Subquery in WHERE clause instead of JOIN."
    fix: "Use JOIN instead of subquery for better performance."
    category: Performance
    
  - id: MISSING_TABLE_EXPIRATION
    title: "Missing table expiration"
    severity: low
    enabled: true
    detect: "Temporary or staging tables without expiration."
    fix: "Set table expiration for temporary tables."
    category: Storage
    
  - id: INEFFICIENT_REGEX
    title: "Inefficient regex pattern"
    severity: medium
    enabled: true
    detect: "REGEXP_EXTRACT or REGEXP_CONTAINS with unbounded patterns."
    fix: "Use anchored patterns or LIKE when possible."
    category: Performance
    
  - id: UNNECESSARY_GROUPBY_COLUMNS
    title: "Unnecessary GROUP BY columns"
    severity: low
    enabled: true
    detect: "GROUP BY with columns not in SELECT."
    fix: "Only group by necessary columns."
    category: Performance
"""