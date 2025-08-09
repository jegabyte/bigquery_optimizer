#!/usr/bin/env python3
"""
Test the exact query that's failing
"""

from google.cloud import bigquery

project = 'aiva-e74f3'
dataset = 'analytics_441577273'
table_pattern = 'events_intraday_%'

# The exact query from our function
query = f"""
WITH table_info AS (
    SELECT 
        t.table_name,
        t.table_type,
        t.creation_time,
        ts.row_count,
        ts.size_bytes,
        -- Check for partitioning
        tp.table_name IS NOT NULL as is_partitioned,
        tp.partition_id,
        tp.partition_expiration_days,
        -- Check for clustering
        tc.clustering_ordinal_position,
        tc.column_name as cluster_column
    FROM `{project}.{dataset}`.INFORMATION_SCHEMA.TABLES t
    LEFT JOIN `{project}.{dataset}`.INFORMATION_SCHEMA.TABLE_STORAGE ts
        ON t.table_name = ts.table_name
    LEFT JOIN `{project}.{dataset}`.INFORMATION_SCHEMA.PARTITIONS tp
        ON t.table_name = tp.table_name
    LEFT JOIN `{project}.{dataset}`.INFORMATION_SCHEMA.CLUSTERING_FIELDS tc
        ON t.table_name = tc.table_name
    WHERE t.table_name LIKE '{table_pattern}'
)
SELECT 
    table_name,
    table_type,
    MAX(row_count) as row_count,
    MAX(size_bytes) as size_bytes,
    MAX(is_partitioned) as is_partitioned,
    STRING_AGG(DISTINCT cluster_column, ', ' ORDER BY cluster_column) as cluster_fields
FROM table_info
GROUP BY table_name, table_type
ORDER BY table_name
LIMIT 5
"""

print("Query to execute:")
print("=" * 50)
print(query)
print("=" * 50)

client = bigquery.Client(project="aiva-e74f3")

try:
    result = client.query(query)
    print("\n✓ Query executed successfully!")
    print("\nResults:")
    for row in result:
        print(f"  - {row.table_name}: {row.row_count} rows, {row.size_bytes} bytes")
except Exception as e:
    print(f"\n✗ Query failed: {e}")
    print(f"\nError details: {e}")