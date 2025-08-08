"""
Metadata Extractor Agent
Extracts table metadata from BigQuery for optimization
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai.types import GenerateContentConfig
import os

# Environment setup is handled by ADK when running

class TableMetadata(BaseModel):
    """Schema for table metadata"""
    table_name: str = Field(description="Full table name (project.dataset.table)")
    partition_column: Optional[str] = Field(default=None, description="Partition column if table is partitioned")
    clustering_columns: List[str] = Field(default_factory=list, description="Clustering columns if table is clustered")
    estimated_size_gb: Optional[float] = Field(default=None, description="Estimated table size in GB")
    row_count: Optional[int] = Field(default=None, description="Estimated row count")


class MetadataExtractionResult(BaseModel):
    """Output schema for metadata extraction"""
    tables: List[TableMetadata] = Field(description="List of tables referenced in the query")
    query_type: str = Field(description="Type of query: SELECT, INSERT, UPDATE, DELETE, etc.")
    has_joins: bool = Field(description="Whether the query contains JOIN operations")
    has_aggregations: bool = Field(description="Whether the query contains GROUP BY or aggregation functions")
    extracted_info: Dict[str, Any] = Field(default_factory=dict, description="Additional extracted information")


# For now, create a simple mock agent since we don't have real BigQuery connection
# This will be replaced with actual BigQuery API calls in Phase 4
metadata_extractor_agent = genai.Agent(
    model="gemini-2.0-flash-exp",
    instructions="""You are a BigQuery metadata extraction specialist. Your role is to:
    
    1. Parse the SQL query to identify all referenced tables
    2. Extract query characteristics (type, joins, aggregations)
    3. Simulate metadata extraction (in production, this would query BigQuery's INFORMATION_SCHEMA)
    
    For mock purposes, assume:
    - Tables ending in '_events' are partitioned by date
    - Tables ending in '_transactions' are partitioned by timestamp and clustered by user_id
    - Tables ending in '_catalog' or '_products' are not partitioned
    - Large tables (events, transactions) are typically 100-500 GB
    - Medium tables (products, users) are typically 10-50 GB
    - Small tables (lookups, configs) are typically < 1 GB
    
    Return structured metadata about the query and its tables.
    """,
    generation_config=GenerateContentConfig(
        temperature=0.3,
        top_k=40,
        top_p=0.95,
        max_output_tokens=4096,
        response_mime_type="application/json",
        response_schema=MetadataExtractionResult,
    ),
)