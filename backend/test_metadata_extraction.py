#!/usr/bin/env python3
"""
Test the enhanced metadata extraction with table name parsing
"""

import json
from app.tools.bigquery_metadata import fetch_tables_metadata

# Test cases with different query patterns
test_cases = [
    {
        "name": "Simple table",
        "tables": ["analytics.events"],
        "expected": 1
    },
    {
        "name": "Multiple tables with join",
        "tables": ["analytics.events", "analytics.users"],
        "expected": 2
    },
    {
        "name": "Wildcard table",
        "tables": ["analytics.events_*"],
        "expected": 1
    },
    {
        "name": "Full path table",
        "tables": ["aiva-e74f3.analytics.events"],
        "expected": 1
    },
    {
        "name": "Mixed formats",
        "tables": ["events", "analytics.users", "aiva-e74f3.analytics.products"],
        "expected": 3
    }
]

print("Testing Enhanced Metadata Extraction")
print("=" * 50)

for test in test_cases:
    print(f"\nTest: {test['name']}")
    print(f"Tables: {test['tables']}")
    
    try:
        # Call the tool function
        result_json = fetch_tables_metadata(test['tables'])
        result = json.loads(result_json)
        
        # Display results
        print(f"✓ Found {result['tables_found']} table(s)")
        print(f"  Total size: {result['total_size_gb']} GB")
        print(f"  Total rows: {result['total_row_count']:,}")
        
        for table in result['tables']:
            if 'error' in table:
                print(f"  ✗ {table['table_path']}: {table['error']}")
            else:
                print(f"  ✓ {table['table_path']}")
                print(f"    - Size: {table.get('size_gb', 0)} GB")
                print(f"    - Rows: {table.get('row_count', 0):,}")
                print(f"    - Partitioned: {table.get('partitioned', False)}")
                print(f"    - Clustered: {table.get('clustered', False)}")
                if table.get('is_wildcard'):
                    print(f"    - Wildcard: {table.get('table_count')} tables matched")
                    print(f"    - Sample tables: {', '.join(table.get('tables_matched', [])[:3])}")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

print("\n" + "=" * 50)
print("Test completed!")