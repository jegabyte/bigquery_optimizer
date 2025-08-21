#!/usr/bin/env python3
"""
Test the BigQuery Optimizer Agent locally
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from agent import root_agent

# Test data
test_input = {
    "tables_metadata": [
        {
            "dataset_id": "analytics",
            "table_id": "user_events",
            "created": "2024-01-15T10:30:00Z",
            "last_modified": "2024-08-09T15:00:00Z",
            "row_count": 5000000,
            "size_bytes": 2147483648,
            "type": "TABLE",
            "time_partitioning": {
                "type": "DAY",
                "field": "event_date"
            },
            "clustering_fields": ["user_id", "event_type"],
            "schema_fields": [
                {"name": "user_id", "type": "STRING", "mode": "REQUIRED"},
                {"name": "event_date", "type": "DATE", "mode": "REQUIRED"},
                {"name": "event_type", "type": "STRING", "mode": "NULLABLE"},
                {"name": "event_data", "type": "JSON", "mode": "NULLABLE"}
            ]
        },
        {
            "dataset_id": "analytics",
            "table_id": "daily_aggregates",
            "created": "2023-06-01T08:00:00Z",
            "last_modified": "2024-08-08T20:00:00Z",
            "row_count": 365000,
            "size_bytes": 536870912,
            "type": "TABLE",
            "time_partitioning": None,
            "clustering_fields": None,
            "schema_fields": [
                {"name": "date", "type": "DATE", "mode": "REQUIRED"},
                {"name": "total_users", "type": "INTEGER", "mode": "NULLABLE"},
                {"name": "total_events", "type": "INTEGER", "mode": "NULLABLE"}
            ]
        }
    ],
    "project_id": "test-project",
    "location": "US"
}

print("Testing BigQuery Optimizer Agent locally...")
print("=" * 50)

# Run the agent
try:
    # For streaming results
    for event in root_agent.stream(test_input):
        if hasattr(event, 'text'):
            print(event.text, end='', flush=True)
        else:
            print(event)
    print()
except Exception as e:
    print(f"Error: {e}")
    # Try non-streaming
    result = root_agent.run(test_input)
    print("Result:", result)

print("=" * 50)
print("Test complete!")