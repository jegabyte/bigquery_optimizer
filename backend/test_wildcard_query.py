#!/usr/bin/env python3
"""
Test metadata extraction for wildcard table query with table suffix
"""

import json
from app.tools.bigquery_metadata import fetch_tables_metadata

# Test with the actual wildcard query
print("Testing metadata extraction for wildcard table query")
print("=" * 70)
print("Query: SELECT * FROM aiva-e74f3.analytics_441577273.events_intraday_*")
print("       WHERE user_id='n2hYDjL9GcUTmYzbC9bnwyTv9kF3'")
print()

# The LLM would extract this table reference from the query
table_paths = ["aiva-e74f3.analytics_441577273.events_intraday_*"]

print("Step 1: LLM extracts wildcard table reference:")
print(f"  → {table_paths[0]}")
print()

print("Step 2: Tool fetches metadata for all matching tables:")
print("-" * 70)

try:
    # Call the metadata tool
    result_json = fetch_tables_metadata(table_paths)
    result = json.loads(result_json)
    
    # Pretty print the summarized JSON output
    print("JSON output summary from tool:")
    print("-" * 70)
    
    # Create a simplified version for display
    simplified = {
        "tables_found": result['tables_found'],
        "total_size_gb": result['total_size_gb'],
        "total_row_count": result['total_row_count'],
        "summary": result.get('summary', ''),
        "tables": []
    }
    
    # For each table, show simplified info
    for table in result['tables']:
        if 'error' not in table:
            table_summary = {
                "table_name": table.get('table_name'),
                "is_wildcard": table.get('is_wildcard', False),
                "table_count": table.get('table_count', 0),
                "size_gb": table.get('size_gb', 0),
                "row_count": table.get('row_count', 0),
                "partitioned": table.get('partitioned', False),
                "partition_field": table.get('partition_field'),
                "clustered": table.get('clustered', False),
                "tables_matched_sample": table.get('tables_matched', [])[:5],
                "column_count": table.get('column_count', 0)
            }
            simplified['tables'].append(table_summary)
    
    print(json.dumps(simplified, indent=2))
    
    print()
    print("Step 3: Detailed Analysis:")
    print("-" * 70)
    print(f"✓ Metadata extraction successful for wildcard pattern")
    print()
    print(f"📊 OVERALL STATISTICS:")
    print(f"  • Pattern matched: {result['tables'][0].get('table_count', 0)} tables")
    print(f"  • Total data size: {result['total_size_gb']} GB")
    print(f"  • Total row count: {result['total_row_count']:,} rows")
    print()
    
    # Show details for the wildcard match
    for table in result['tables']:
        if 'error' not in table:
            print(f"📋 TABLE PATTERN DETAILS:")
            print(f"  • Pattern: {table.get('table_name')}")
            print(f"  • Type: Wildcard table group")
            print()
            
            print(f"🗓️ DATE-SHARDED TABLES:")
            if table.get('tables_matched'):
                print(f"  • Found {len(table.get('tables_matched', []))} tables matching pattern")
                print(f"  • Date range: {table.get('tables_matched', [])[0]} to {table.get('tables_matched', [])[-1]}")
                print(f"  • Sample tables:")
                for t in table.get('tables_matched', [])[:10]:
                    print(f"      - {t}")
                if len(table.get('tables_matched', [])) > 10:
                    print(f"      ... and {len(table.get('tables_matched', [])) - 10} more tables")
            print()
            
            print(f"💾 STORAGE METRICS:")
            print(f"  • Total size: {table.get('size_gb', 0)} GB ({table.get('size_mb', 0):.2f} MB)")
            print(f"  • Average size per table: {table.get('size_gb', 0) / max(table.get('table_count', 1), 1):.4f} GB")
            print(f"  • Total rows: {table.get('row_count', 0):,}")
            print(f"  • Average rows per table: {int(table.get('row_count', 0) / max(table.get('table_count', 1), 1)):,}")
            print()
            
            print(f"🔧 OPTIMIZATION PROPERTIES:")
            print(f"  • Partitioned: {table.get('partitioned', False)}")
            if table.get('partition_field'):
                print(f"    → Partition field: {table.get('partition_field')}")
                print(f"    → ⚡ Can use _TABLE_SUFFIX for date filtering")
            print(f"  • Clustered: {table.get('clustered', False)}")
            if table.get('cluster_fields'):
                print(f"    → Cluster fields: {', '.join(table.get('cluster_fields'))}")
            print()
            
            if table.get('column_names'):
                print(f"📝 SCHEMA INFORMATION:")
                print(f"  • Column count: {len(table.get('column_names', []))}")
                print(f"  • Sample columns:")
                for col in table.get('column_names', [])[:10]:
                    print(f"      - {col}")
                if len(table.get('column_names', [])) > 10:
                    print(f"      ... and {len(table.get('column_names', [])) - 10} more columns")
                
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70)
print("OPTIMIZATION INSIGHTS FROM METADATA:")
print("-" * 70)
print("Based on this metadata, the optimizer can suggest:")
print()
print("1. 📅 DATE FILTERING:")
print("   • Use _TABLE_SUFFIX to limit date range")
print("   • Example: WHERE _TABLE_SUFFIX BETWEEN '20250101' AND '20250131'")
print()
print("2. 🎯 TARGETED SCANNING:")
print("   • Instead of scanning all 206 tables (5.04 GB)")
print("   • Filter to specific dates to reduce data scanned")
print()
print("3. 💰 COST ESTIMATION:")
print("   • Full scan cost: ~5.04 GB")
print("   • With date filter: Much less (depends on date range)")
print()
print("4. 🚀 PERFORMANCE:")
print("   • Consider creating a clustered version on 'user_id'")
print("   • Or create a materialized view for frequent user queries")
print("=" * 70)