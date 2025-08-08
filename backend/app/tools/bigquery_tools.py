"""
BigQuery Tools using Application Default Credentials
Real BigQuery integration for metadata and query analysis
"""

from typing import Dict, Any, Optional, List
from google.cloud import bigquery
from google.cloud.exceptions import GoogleCloudError
from app.config import GOOGLE_CLOUD_PROJECT, BIGQUERY_DATASET, CREDENTIALS

class BigQueryClient:
    """BigQuery client using ADC"""
    
    def __init__(self, project_id: str = None):
        """Initialize BigQuery client with ADC"""
        self.project_id = project_id or GOOGLE_CLOUD_PROJECT
        
        try:
            # Use ADC credentials
            self.client = bigquery.Client(
                project=self.project_id,
                credentials=CREDENTIALS
            )
            print(f"✓ BigQuery client initialized for project: {self.project_id}")
        except Exception as e:
            print(f"⚠️  BigQuery initialization error: {e}")
            self.client = None
    
    def test_connection(self) -> bool:
        """Test BigQuery connection"""
        if not self.client:
            return False
            
        try:
            # Try to list datasets
            datasets = list(self.client.list_datasets(max_results=1))
            print(f"✓ BigQuery connection successful. Found {len(datasets)} dataset(s)")
            return True
        except Exception as e:
            print(f"✗ BigQuery connection failed: {e}")
            return False
    
    def get_table_metadata(self, table_id: str) -> Dict[str, Any]:
        """
        Get metadata for a BigQuery table
        
        Args:
            table_id: Full table ID (project.dataset.table) or just table name
        """
        if not self.client:
            return self._mock_metadata(table_id)
        
        try:
            # Handle different table_id formats
            if '.' not in table_id:
                table_id = f"{self.project_id}.{BIGQUERY_DATASET}.{table_id}"
            elif table_id.count('.') == 1:
                table_id = f"{self.project_id}.{table_id}"
            
            table = self.client.get_table(table_id)
            
            return {
                "table_name": table_id,
                "num_rows": table.num_rows,
                "size_gb": round(table.num_bytes / (1024**3), 2) if table.num_bytes else 0,
                "size_bytes": table.num_bytes,
                "created": table.created.isoformat() if table.created else None,
                "modified": table.modified.isoformat() if table.modified else None,
                "partition_field": table.time_partitioning.field if table.time_partitioning else None,
                "partition_type": table.time_partitioning.type_ if table.time_partitioning else None,
                "clustering_fields": table.clustering_fields or [],
                "schema": [
                    {
                        "name": field.name,
                        "type": field.field_type,
                        "mode": field.mode
                    }
                    for field in table.schema
                ]
            }
        except GoogleCloudError as e:
            print(f"⚠️  Error getting table metadata for {table_id}: {e}")
            return self._mock_metadata(table_id)
    
    def dry_run_query(self, query: str) -> Dict[str, Any]:
        """
        Perform a dry run of a query to estimate costs
        
        Args:
            query: SQL query to analyze
        """
        if not self.client:
            return self._mock_dry_run(query)
        
        try:
            job_config = bigquery.QueryJobConfig(
                dry_run=True,
                use_query_cache=False
            )
            
            query_job = self.client.query(query, job_config=job_config)
            
            # Calculate cost (BigQuery pricing: $6.25 per TB)
            bytes_processed = query_job.total_bytes_processed or 0
            tb_processed = bytes_processed / (1024**4)
            estimated_cost = tb_processed * 6.25
            
            return {
                "bytes_processed": bytes_processed,
                "gb_processed": round(bytes_processed / (1024**3), 2),
                "estimated_cost_usd": round(estimated_cost, 4),
                "cache_hit": False,
                "slot_millis": query_job.total_slot_millis if hasattr(query_job, 'total_slot_millis') else None,
                "is_valid": True,
                "error": None
            }
        except Exception as e:
            print(f"⚠️  Dry run error: {e}")
            return {
                "bytes_processed": 0,
                "gb_processed": 0,
                "estimated_cost_usd": 0,
                "is_valid": False,
                "error": str(e)
            }
    
    def analyze_query_plan(self, query: str) -> Dict[str, Any]:
        """
        Get query execution plan
        """
        if not self.client:
            return {"stages": [], "error": "BigQuery client not initialized"}
        
        try:
            job_config = bigquery.QueryJobConfig(
                dry_run=True,
                use_query_cache=False
            )
            
            query_job = self.client.query(query, job_config=job_config)
            
            # Extract query plan information
            return {
                "total_bytes_processed": query_job.total_bytes_processed,
                "estimated_bytes_processed": query_job.estimated_bytes_processed if hasattr(query_job, 'estimated_bytes_processed') else None,
                "statement_type": query_job.statement_type if hasattr(query_job, 'statement_type') else "SELECT",
                "referenced_tables": self._extract_table_references(query),
                "complexity": self._estimate_complexity(query)
            }
        except Exception as e:
            return {"error": str(e)}
    
    def list_datasets(self) -> List[str]:
        """List all datasets in the project"""
        if not self.client:
            return []
        
        try:
            datasets = list(self.client.list_datasets())
            return [dataset.dataset_id for dataset in datasets]
        except Exception as e:
            print(f"⚠️  Error listing datasets: {e}")
            return []
    
    def list_tables(self, dataset_id: str = None) -> List[str]:
        """List all tables in a dataset"""
        if not self.client:
            return []
        
        dataset_id = dataset_id or BIGQUERY_DATASET
        
        try:
            tables = list(self.client.list_tables(f"{self.project_id}.{dataset_id}"))
            return [table.table_id for table in tables]
        except Exception as e:
            print(f"⚠️  Error listing tables: {e}")
            return []
    
    def _mock_metadata(self, table_id: str) -> Dict[str, Any]:
        """Return mock metadata when BigQuery is not available"""
        return {
            "table_name": table_id,
            "num_rows": 1000000,
            "size_gb": 10.5,
            "partition_field": "date" if "events" in table_id else None,
            "clustering_fields": ["user_id"] if "transactions" in table_id else [],
            "is_mock": True
        }
    
    def _mock_dry_run(self, query: str) -> Dict[str, Any]:
        """Return mock dry run results"""
        # Estimate based on query patterns
        base_gb = 10
        if "select *" in query.lower():
            base_gb *= 2
        if "join" in query.lower():
            base_gb *= 1.5
        if "where" in query.lower():
            base_gb *= 0.3
        if "limit" in query.lower():
            base_gb *= 0.1
            
        bytes_processed = int(base_gb * 1024**3)
        estimated_cost = (bytes_processed / (1024**4)) * 6.25
        
        return {
            "bytes_processed": bytes_processed,
            "gb_processed": base_gb,
            "estimated_cost_usd": round(estimated_cost, 4),
            "cache_hit": False,
            "is_valid": True,
            "is_mock": True
        }
    
    def _extract_table_references(self, query: str) -> List[str]:
        """Extract table references from query"""
        # Simple extraction - in production use SQL parser
        import re
        pattern = r'FROM\s+([`\w\.\-]+)|JOIN\s+([`\w\.\-]+)'
        matches = re.findall(pattern, query, re.IGNORECASE)
        tables = []
        for match in matches:
            table = match[0] or match[1]
            if table:
                tables.append(table.strip('`'))
        return list(set(tables))
    
    def _estimate_complexity(self, query: str) -> str:
        """Estimate query complexity"""
        query_lower = query.lower()
        
        complexity_score = 0
        if "join" in query_lower:
            complexity_score += query_lower.count("join") * 2
        if "group by" in query_lower:
            complexity_score += 2
        if "order by" in query_lower:
            complexity_score += 1
        if "window" in query_lower or "over(" in query_lower:
            complexity_score += 3
        if "distinct" in query_lower:
            complexity_score += 1
        if "union" in query_lower:
            complexity_score += 2
        
        if complexity_score <= 2:
            return "simple"
        elif complexity_score <= 5:
            return "moderate"
        else:
            return "complex"


# Singleton instance
_client = None

def get_bigquery_client() -> BigQueryClient:
    """Get or create BigQuery client singleton"""
    global _client
    if _client is None:
        _client = BigQueryClient()
        _client.test_connection()
    return _client