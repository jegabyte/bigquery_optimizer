"""
BigQuery Metadata Tool for fetching actual table statistics
"""

import os
import re
from typing import Dict, Any, List, Optional
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
        """Get actual metadata for a specific table, view, or wildcard pattern"""
        try:
            client = self._get_client()
            
            # Remove backticks if present
            table_ref = table_ref.replace('`', '').strip()
            
            # Parse table reference
            parts = table_ref.split('.')
            if len(parts) == 3:
                project, dataset, table = parts
            elif len(parts) == 2:
                project = self.project_id
                dataset, table = parts
            else:
                project = self.project_id
                dataset = os.getenv("BIGQUERY_DATASET", "analytics")  # Use env default
                table = parts[0]
            
            # Don't modify dataset names - they can have numbers and underscores
            # analytics_441577273 is a valid dataset name in BigQuery
            
            # Validate project ID - should not contain dots
            # If project contains dots, it means we parsed incorrectly
            if '.' in project:
                logger.error(f"Invalid project ID '{project}' - contains dots, reparsing")
                # This might mean the table reference was incorrectly parsed
                # Re-parse assuming it's project.dataset.table
                all_parts = table_ref.split('.')
                if len(all_parts) >= 3:
                    project = all_parts[0]
                    dataset = all_parts[1] 
                    table = '.'.join(all_parts[2:])  # Rest is table name
                else:
                    project = self.project_id
            
            # Handle wildcard tables (e.g., events_*, events_202*)
            if '*' in table or '%' in table:
                return self._get_wildcard_table_metadata(project, dataset, table.replace('*', '%'))
            
            # Build full table reference
            table_ref_full = f"{project}.{dataset}.{table}"
            
            # Try to get the table/view metadata
            try:
                table_obj = client.get_table(table_ref_full)
            except NotFound:
                # Handle table suffixes - might be a sharded table
                if '_' in table and any(char.isdigit() for char in table.split('_')[-1]):
                    base_table = '_'.join(table.split('_')[:-1])
                    suffix = table.split('_')[-1]
                    if suffix.isdigit() and len(suffix) >= 6:  # Likely a date suffix
                        logger.info(f"Table {table} not found, checking for wildcard pattern {base_table}_*")
                        return self._get_wildcard_table_metadata(project, dataset, f"{base_table}_%")
                
                # Table truly not found
                raise NotFound(f"Table {table_ref_full} not found")
            
            # Log the raw values for debugging
            logger.info(f"Table {table_ref_full}: num_bytes={table_obj.num_bytes}, num_rows={table_obj.num_rows}")
            
            # For GA4 tables and some other tables, size might not be immediately available
            # Try to get size from TABLE_STORAGE or __TABLES__ if num_bytes is None
            size_bytes = table_obj.num_bytes
            row_count = table_obj.num_rows or 0
            
            if size_bytes is None or size_bytes == 0:
                try:
                    # Try using __TABLES__ which usually has size info
                    tables_query = f"""
                    SELECT size_bytes, row_count 
                    FROM `{project}.{dataset}.__TABLES__`
                    WHERE table_id = '{table}'
                    """
                    tables_result = client.query(tables_query)
                    for row in tables_result:
                        if row.size_bytes is not None:
                            size_bytes = row.size_bytes
                            logger.info(f"Got size from __TABLES__: {size_bytes} bytes")
                        if row.row_count is not None and row_count == 0:
                            row_count = row.row_count
                        break
                except Exception as e:
                    logger.warning(f"Could not get size from __TABLES__: {e}")
            
            # Use the size we found (or 0 if nothing worked)
            size_bytes = size_bytes or 0
            
            # Get comprehensive metadata
            metadata = {
                "table_path": table_ref_full,
                "project": project,
                "dataset": dataset,
                "table_name": table,
                
                # Size and row metrics
                "row_count": row_count,
                "size_bytes": size_bytes,
                "size_gb": round(size_bytes / (1024**3), 2) if size_bytes > 0 else 0,
                "size_mb": round(size_bytes / (1024**2), 2) if size_bytes > 0 else 0,
                
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
            
            # For VIEWs, get the underlying table information
            if table_obj.table_type == "VIEW":
                view_definition = self._get_view_underlying_tables(table_obj, project, dataset, table)
                if view_definition:
                    metadata["view_definition"] = view_definition
            
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
    
    def _get_view_underlying_tables(self, view_obj, project: str, dataset: str, view_name: str) -> Dict[str, Any]:
        """Extract underlying table information from a view"""
        try:
            client = self._get_client()
            
            # Get view definition
            view_query = view_obj.view_query if hasattr(view_obj, 'view_query') else None
            
            if not view_query:
                # Try to get view definition from INFORMATION_SCHEMA
                query = f"""
                SELECT view_definition 
                FROM `{project}.{dataset}.INFORMATION_SCHEMA.VIEWS`
                WHERE table_name = '{view_name}'
                """
                try:
                    result = list(client.query(query))
                    if result:
                        view_query = result[0].view_definition
                except Exception as e:
                    logger.warning(f"Could not fetch view definition from INFORMATION_SCHEMA: {e}")
                    return None
            
            if not view_query:
                return None
            
            # Extract table references from the view query
            underlying_tables = self.extract_tables_from_query(view_query)
            
            # Get metadata for each underlying table
            underlying_metadata = []
            total_size_gb = 0
            total_rows = 0
            
            for table_ref in underlying_tables:
                try:
                    # Get metadata for this underlying table
                    table_metadata = self.get_table_metadata(table_ref)
                    
                    # Only include essential info to avoid recursion/bloat
                    if "error" not in table_metadata:
                        simplified_metadata = {
                            "table_path": table_metadata.get("table_path"),
                            "table_name": table_metadata.get("table_name"),
                            "dataset": table_metadata.get("dataset"),
                            "table_type": table_metadata.get("table_type"),
                            "size_gb": table_metadata.get("size_gb", 0),
                            "row_count": table_metadata.get("row_count", 0),
                            "partitioned": table_metadata.get("partitioned", False),
                            "partition_field": table_metadata.get("partition_field"),
                            "clustered": table_metadata.get("clustered", False),
                            "cluster_fields": table_metadata.get("cluster_fields", [])
                        }
                        underlying_metadata.append(simplified_metadata)
                        total_size_gb += table_metadata.get("size_gb", 0)
                        total_rows += table_metadata.get("row_count", 0)
                except Exception as e:
                    logger.warning(f"Could not get metadata for underlying table {table_ref}: {e}")
                    underlying_metadata.append({
                        "table_path": table_ref,
                        "error": str(e)
                    })
            
            return {
                "sql": view_query[:500] + "..." if len(view_query) > 500 else view_query,  # Truncate long queries
                "underlying_tables": underlying_metadata,
                "underlying_tables_count": len(underlying_tables),
                "total_underlying_size_gb": round(total_size_gb, 2),
                "total_underlying_rows": total_rows,
                "optimization_hints": [
                    "Views don't store data - query performance depends on underlying tables",
                    f"This view queries {len(underlying_tables)} table(s) totaling {round(total_size_gb, 2)} GB",
                    "Consider materializing if frequently queried with similar filters",
                    "Ensure underlying tables are properly partitioned and clustered"
                ]
            }
            
        except Exception as e:
            logger.warning(f"Error extracting view definition: {e}")
            return None
    
    def _get_wildcard_table_metadata(self, project: str, dataset: str, table_pattern: str) -> Dict[str, Any]:
        """Get aggregated metadata for wildcard tables"""
        try:
            client = self._get_client()
            
            # Don't modify dataset names - they are valid as-is
            # analytics_441577273 is a valid dataset name in BigQuery
            
            # Validate project ID - should not contain dots or be a path
            if '.' in project:
                logger.error(f"Invalid project ID '{project}' - contains dots, using default project")
                # This likely means we got passed something like "project.dataset" as project
                # Use the default project ID instead
                project = self.project_id
            
            # Use __TABLES__ meta-table for wildcard queries
            # INFORMATION_SCHEMA doesn't work well with some datasets like GA4 exports
            query = f"""
            SELECT 
                table_id as table_name,
                size_bytes,
                row_count,
                TIMESTAMP_MILLIS(creation_time) as creation_time,
                CASE 
                    WHEN type = 1 THEN 'TABLE'
                    WHEN type = 2 THEN 'VIEW'
                    ELSE 'OTHER'
                END as table_type
            FROM `{project}.{dataset}.__TABLES__`
            WHERE table_id LIKE '{table_pattern}'
            ORDER BY table_id
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
            
            # Get sample schema from first table
            # For wildcard tables (like GA4 events_intraday_*), all tables have the same schema
            sample_schema = []
            column_names = []
            if tables_list:
                try:
                    # Use the first matched table to get the schema
                    sample_table_name = tables_list[0]
                    logger.info(f"Fetching schema from sample table: {sample_table_name}")
                    sample_table = client.get_table(f"{project}.{dataset}.{sample_table_name}")
                    column_names = [field.name for field in sample_table.schema]
                    # Only get limited schema details to avoid huge response
                    sample_schema = self._extract_schema(sample_table.schema)[:20]  # Limit to 20 fields
                    logger.info(f"Successfully fetched {len(column_names)} columns from {sample_table_name}")
                except Exception as e:
                    logger.warning(f"Could not get schema for sample table {tables_list[0]}: {e}")
            
            # For wildcard tables, we assume they're partitioned by table suffix
            # GA4 export tables are typically partitioned this way
            is_partitioned = '_' in table_pattern and table_count > 0
            
            return {
                "table_path": f"{project}.{dataset}.{table_pattern.replace('%', '*')}",
                "project": project,
                "dataset": dataset,
                "table_name": table_pattern.replace('%', '*'),
                "is_wildcard": True,
                "table_count": table_count,
                "tables_matched": tables_list[:10],  # First 10 tables
                "row_count": total_rows,
                "size_bytes": total_bytes,
                "size_gb": round(total_bytes / (1024**3), 2),
                "size_mb": round(total_bytes / (1024**2), 2),
                "partitioned": is_partitioned,
                "partition_field": "_TABLE_SUFFIX" if is_partitioned else None,
                "clustered": False,  # Can't determine from __TABLES__
                "cluster_fields": [],
                "column_names": column_names,
                "schema": sample_schema[:10] if sample_schema else [],  # Limit schema size
                "column_count": len(column_names)
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
            FROM `{self.project_id}.{dataset_id}`.INFORMATION_SCHEMA.TABLE_STORAGE
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

# Create functions that can be used as ADK tools
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

def fetch_tables_metadata(table_paths: list[str]) -> str:
    """
    Fetch BigQuery metadata for specific table paths.
    
    Args:
        table_paths: List of table paths (e.g., ["project.dataset.table", "dataset.table", "table"])
    
    Returns:
        JSON string with detailed metadata for each table
    """
    import json
    tool = BigQueryMetadataTool()
    
    metadata_list = []
    total_size_gb = 0
    total_rows = 0
    
    for table_path in table_paths:
        try:
            # Get metadata for each table
            metadata = tool.get_table_metadata(table_path)
            
            # Add to list even if there was an error (to show which tables couldn't be found)
            metadata_list.append(metadata)
            
            # Accumulate totals only for successful fetches
            if "error" not in metadata:
                total_size_gb += metadata.get("size_gb", 0)
                total_rows += metadata.get("row_count", 0)
        except Exception as e:
            # Add error entry for this table
            metadata_list.append({
                "table_path": table_path,
                "error": str(e),
                "size_gb": 0,
                "row_count": 0
            })
    
    result = {
        "tables_found": len(table_paths),
        "total_size_gb": round(total_size_gb, 2),
        "total_row_count": total_rows,
        "tables": metadata_list,
        "summary": f"Found {len(table_paths)} table(s) totaling {round(total_size_gb, 2)}GB with {total_rows:,} rows"
    }
    
    return json.dumps(result, indent=2)

def format_bytes(bytes_value: int) -> str:
    """Format bytes into human-readable string"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB', 'PB']:
        if bytes_value < 1024.0:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024.0
    return f"{bytes_value:.2f} PB"

def calculate_cost(bytes_processed: int, price_per_tb: float = 6.25) -> float:
    """
    Calculate BigQuery query cost based on bytes processed
    Default pricing: $6.25 per TB for on-demand queries
    Note: BigQuery uses decimal TB (1 TB = 10^12 bytes), not binary TiB
    """
    tb_processed = bytes_processed / (10 ** 12)  # Convert bytes to TB (decimal)
    cost = tb_processed * price_per_tb
    return round(cost, 2)  # Round to 2 decimal places for currency

def bigquery_dry_run(query: str, project_id: Optional[str] = None) -> str:
    """
    Performs BigQuery dry run to validate query and estimate costs
    
    Args:
        query: SQL query to validate
        project_id: Optional project ID (uses default if not provided)
    
    Returns:
        JSON string with validation results including:
        - valid: Whether query is syntactically valid
        - bytes_processed: Estimated bytes to be processed
        - bytes_processed_formatted: Human-readable format
        - estimated_cost_usd: Estimated cost in USD
        - referenced_tables: List of tables referenced
        - statement_type: Type of SQL statement
        - error_message: Error details if invalid
    """
    import json
    
    # Use provided project_id or fall back to environment variable
    if not project_id:
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
    
    try:
        # Create BigQuery client
        client = bigquery.Client(project=project_id)
        
        # Configure for dry run (no actual query execution)
        # use_query_cache=False ensures we get accurate cost estimates
        job_config = bigquery.QueryJobConfig(
            dry_run=True,
            use_query_cache=False
        )
        
        # Perform dry run
        query_job = client.query(query, job_config=job_config)
        
        # Extract table references
        referenced_tables = []
        if query_job.referenced_tables:
            referenced_tables = [
                f"{table.project}.{table.dataset_id}.{table.table_id}"
                for table in query_job.referenced_tables
            ]
        
        # Build successful response
        result = {
            "valid": True,
            "bytes_processed": query_job.total_bytes_processed or 0,
            "bytes_processed_formatted": format_bytes(query_job.total_bytes_processed or 0),
            "estimated_cost_usd": calculate_cost(query_job.total_bytes_processed or 0),
            "referenced_tables": referenced_tables,
            "statement_type": query_job.statement_type if hasattr(query_job, 'statement_type') else "UNKNOWN",
            "uses_legacy_sql": query_job.uses_legacy_sql if hasattr(query_job, 'uses_legacy_sql') else False,
            "error_message": None
        }
        
        logger.info(f"Dry run successful: {result['bytes_processed_formatted']} = ${result['estimated_cost_usd']}")
        
    except Exception as e:
        # Build error response
        error_msg = str(e)
        logger.error(f"Dry run failed: {error_msg}")
        
        result = {
            "valid": False,
            "bytes_processed": 0,
            "bytes_processed_formatted": "0 B",
            "estimated_cost_usd": 0.0,
            "referenced_tables": [],
            "statement_type": "UNKNOWN",
            "uses_legacy_sql": False,
            "error_message": error_msg
        }
    
    return json.dumps(result, indent=2)