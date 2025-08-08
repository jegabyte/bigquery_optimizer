"""
BigQuery Metadata Tool for fetching actual table statistics
"""

import os
import re
from typing import Dict, Any, List
from google.cloud import bigquery
from google.cloud.exceptions import NotFound
import logging

logger = logging.getLogger(__name__)

class BigQueryMetadataTool:
    """Tool to fetch actual BigQuery table metadata"""
    
    def __init__(self):
        self.client = None
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
    
    def _get_client(self):
        """Get or create BigQuery client"""
        if not self.client:
            self.client = bigquery.Client(project=self.project_id)
        return self.client
    
    def _extract_schema(self, schema) -> List[Dict[str, Any]]:
        """Extract schema information from BigQuery schema"""
        schema_info = []
        for field in schema:
            field_info = {
                "name": field.name,
                "type": field.field_type,
                "mode": field.mode,
                "description": field.description or "",
                "is_nullable": field.mode != "REQUIRED",
                "is_repeated": field.mode == "REPEATED"
            }
            
            # Handle nested fields (RECORD type)
            if field.field_type == "RECORD" and field.fields:
                field_info["fields"] = self._extract_schema(field.fields)
            
            schema_info.append(field_info)
        
        return schema_info
    
    def extract_tables_from_query(self, query: str) -> List[str]:
        """Extract table references from SQL query"""
        tables = []
        
        # Common patterns for table references
        patterns = [
            r'FROM\s+`?([^`\s,]+)`?',  # FROM table
            r'JOIN\s+`?([^`\s,]+)`?',   # JOIN table
            r'INTO\s+`?([^`\s,]+)`?',   # INSERT INTO table
            r'UPDATE\s+`?([^`\s,]+)`?', # UPDATE table
            r'TABLE\s+`?([^`\s,]+)`?',  # WITH table
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, query, re.IGNORECASE)
            tables.extend(matches)
        
        # Clean and deduplicate
        cleaned_tables = []
        for table in tables:
            # Remove backticks and clean
            table = table.replace('`', '').strip()
            
            # Handle wildcard tables (e.g., events_*)
            if '*' in table:
                table = table.replace('*', '%')  # Use % for metadata query
            
            if table and table not in cleaned_tables:
                cleaned_tables.append(table)
        
        return cleaned_tables
    
    def get_table_metadata(self, table_ref: str) -> Dict[str, Any]:
        """Get actual metadata for a specific table"""
        try:
            client = self._get_client()
            
            # Parse table reference
            parts = table_ref.split('.')
            if len(parts) == 3:
                project, dataset, table = parts
            elif len(parts) == 2:
                project = self.project_id
                dataset, table = parts
            else:
                project = self.project_id
                dataset = "analytics"  # default dataset
                table = parts[0]
            
            # Handle wildcard tables
            if '%' in table or '*' in table:
                return self._get_wildcard_table_metadata(project, dataset, table.replace('*', '%'))
            
            # Get table reference
            table_ref = f"{project}.{dataset}.{table}"
            table_obj = client.get_table(table_ref)
            
            # Get comprehensive metadata
            metadata = {
                "table_path": table_ref,
                "project": project,
                "dataset": dataset,
                "table_name": table,
                
                # Size and row metrics
                "row_count": table_obj.num_rows or 0,
                "size_bytes": table_obj.num_bytes or 0,
                "size_gb": round((table_obj.num_bytes or 0) / (1024**3), 2),
                "size_mb": round((table_obj.num_bytes or 0) / (1024**2), 2),
                
                # Partitioning information
                "partitioned": table_obj.partitioning_type is not None,
                "partition_type": table_obj.partitioning_type,
                "partition_field": table_obj.time_partitioning.field if table_obj.time_partitioning else None,
                "partition_expiration_days": table_obj.time_partitioning.expiration_ms / (1000 * 60 * 60 * 24) if table_obj.time_partitioning and table_obj.time_partitioning.expiration_ms else None,
                
                # Clustering information
                "clustered": table_obj.clustering_fields is not None,
                "cluster_fields": table_obj.clustering_fields or [],
                
                # Schema information
                "schema": self._extract_schema(table_obj.schema) if table_obj.schema else [],
                "column_count": len(table_obj.schema) if table_obj.schema else 0,
                "column_names": [field.name for field in table_obj.schema] if table_obj.schema else [],
                
                # Table properties
                "table_type": table_obj.table_type,
                "created": table_obj.created.isoformat() if table_obj.created else None,
                "modified": table_obj.modified.isoformat() if table_obj.modified else None,
                "expires": table_obj.expires.isoformat() if table_obj.expires else None,
                "description": table_obj.description or "",
                "labels": table_obj.labels or {},
                
                # Performance hints
                "require_partition_filter": table_obj.require_partition_filter if hasattr(table_obj, 'require_partition_filter') else False,
                "location": table_obj.location if hasattr(table_obj, 'location') else None
            }
            
            return metadata
            
        except NotFound:
            logger.warning(f"Table not found: {table_ref}")
            return {
                "table_path": table_ref,
                "error": "Table not found",
                "size_gb": 0,
                "row_count": 0
            }
        except Exception as e:
            logger.error(f"Error fetching metadata for {table_ref}: {e}")
            return {
                "table_path": table_ref,
                "error": str(e),
                "size_gb": 0,
                "row_count": 0
            }
    
    def _get_wildcard_table_metadata(self, project: str, dataset: str, table_pattern: str) -> Dict[str, Any]:
        """Get aggregated metadata for wildcard tables"""
        try:
            client = self._get_client()
            
            # Query to get all matching tables
            query = f"""
            SELECT 
                table_name,
                row_count,
                size_bytes
            FROM `{project}.{dataset}.INFORMATION_SCHEMA.TABLE_STORAGE`
            WHERE table_name LIKE '{table_pattern}'
            """
            
            result = client.query(query)
            
            total_rows = 0
            total_bytes = 0
            table_count = 0
            tables_list = []
            
            for row in result:
                table_count += 1
                total_rows += row.row_count or 0
                total_bytes += row.size_bytes or 0
                tables_list.append(row.table_name)
            
            return {
                "table_path": f"{project}.{dataset}.{table_pattern}",
                "project": project,
                "dataset": dataset,
                "table_name": table_pattern,
                "is_wildcard": True,
                "table_count": table_count,
                "tables_matched": tables_list[:5],  # First 5 tables
                "row_count": total_rows,
                "size_bytes": total_bytes,
                "size_gb": round(total_bytes / (1024**3), 2),
                "partitioned": True,  # Wildcard tables are typically partitioned
                "partition_field": "_TABLE_SUFFIX",
                "clustered": False,
                "cluster_fields": []
            }
            
        except Exception as e:
            logger.error(f"Error fetching wildcard metadata: {e}")
            return {
                "table_path": f"{project}.{dataset}.{table_pattern}",
                "error": str(e),
                "size_gb": 0,
                "row_count": 0
            }
    
    def get_dataset_stats(self, dataset_id: str = None) -> Dict[str, Any]:
        """Get statistics for an entire dataset"""
        try:
            client = self._get_client()
            dataset_id = dataset_id or os.getenv("BIGQUERY_DATASET", "analytics")
            
            # Query to get dataset statistics
            query = f"""
            SELECT 
                COUNT(DISTINCT table_name) as table_count,
                SUM(size_bytes) as total_bytes,
                SUM(row_count) as total_rows,
                MAX(creation_time) as latest_table_created,
                MIN(creation_time) as oldest_table_created
            FROM `{self.project_id}.{dataset_id}.INFORMATION_SCHEMA.TABLE_STORAGE`
            WHERE table_schema = '{dataset_id}'
            """
            
            result = list(client.query(query))[0]
            
            return {
                "dataset": dataset_id,
                "table_count": result.table_count or 0,
                "total_size_gb": round((result.total_bytes or 0) / (1024**3), 2),
                "total_rows": result.total_rows or 0,
                "latest_table": result.latest_table_created.isoformat() if result.latest_table_created else None,
                "oldest_table": result.oldest_table_created.isoformat() if result.oldest_table_created else None
            }
        except Exception as e:
            logger.error(f"Error getting dataset stats: {e}")
            return {"error": str(e)}
    
    def get_query_metadata(self, query: str) -> Dict[str, Any]:
        """Get metadata for all tables in a query"""
        tables = self.extract_tables_from_query(query)
        
        metadata_list = []
        total_size_gb = 0
        total_rows = 0
        
        for table in tables:
            metadata = self.get_table_metadata(table)
            metadata_list.append(metadata)
            total_size_gb += metadata.get("size_gb", 0)
            total_rows += metadata.get("row_count", 0)
        
        return {
            "tables_found": len(tables),
            "total_size_gb": round(total_size_gb, 2),
            "total_row_count": total_rows,
            "tables": metadata_list,
            "summary": f"Found {len(tables)} table(s) totaling {round(total_size_gb, 2)}GB with {total_rows:,} rows"
        }

# Create a function that can be used as an ADK tool
def fetch_bigquery_metadata(query: str) -> str:
    """
    Fetch actual BigQuery metadata for tables in the query.
    
    Args:
        query: SQL query to analyze
    
    Returns:
        JSON string with table metadata
    """
    import json
    tool = BigQueryMetadataTool()
    metadata = tool.get_query_metadata(query)
    return json.dumps(metadata, indent=2)