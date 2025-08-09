#!/usr/bin/env python3
"""
Test that VIEWs now return underlying table information
"""

import json
from app.tools.bigquery_metadata import fetch_tables_metadata
from google.cloud import bigquery

# Test with an actual view
print("Testing VIEW metadata with underlying table information")
print("=" * 70)

# First, let's find actual views in the dataset
client = bigquery.Client(project="aiva-e74f3")

print("Step 1: Finding views in firebase_exports dataset...")
print("-" * 70)

views_found = []
tables = client.list_tables("aiva-e74f3.firebase_exports")
for table in tables:
    if table.table_type == "VIEW":
        views_found.append(f"aiva-e74f3.firebase_exports.{table.table_id}")
        print(f"  ✓ Found view: {table.table_id}")

if not views_found:
    print("  No views found in firebase_exports dataset")
    print("\nChecking analytics dataset for views...")
    tables = client.list_tables("aiva-e74f3.analytics_441577273")
    for table in tables:
        if table.table_type == "VIEW":
            views_found.append(f"aiva-e74f3.analytics_441577273.{table.table_id}")
            print(f"  ✓ Found view: {table.table_id}")

if views_found:
    view_path = views_found[0]
    print(f"\nUsing view: {view_path}")
else:
    # Create a test view if none exist
    print("\nNo views found. Creating a test view...")
    view_path = "aiva-e74f3.firebase_exports.test_users_view"
    
    try:
        # Create a simple view
        query = f"""
        CREATE OR REPLACE VIEW `{view_path}` AS
        SELECT 
            user_id,
            user_pseudo_id,
            first_open_timestamp,
            user_first_touch_timestamp,
            user_ltv
        FROM `aiva-e74f3.firebase_exports.users`
        WHERE user_id IS NOT NULL
        LIMIT 1000
        """
        
        client.query(query).result()
        print(f"  ✓ Created test view: {view_path}")
    except Exception as e:
        print(f"  ✗ Could not create test view: {e}")
        # Use a hypothetical view name
        view_path = "aiva-e74f3.firebase_exports.users_view"

print("\n" + "=" * 70)
print(f"Step 2: Testing metadata extraction for: {view_path}")
print("-" * 70)

try:
    # Call the metadata tool
    result_json = fetch_tables_metadata([view_path])
    result = json.loads(result_json)
    
    for table in result['tables']:
        if 'error' in table:
            print(f"✗ View not found: {table.get('table_path')}")
            print(f"  Error: {table['error']}")
        else:
            print(f"✓ VIEW METADATA EXTRACTED:")
            print()
            
            # Basic view information
            print("📋 VIEW INFORMATION:")
            print(f"  • Path: {table.get('table_path')}")
            print(f"  • Type: {table.get('table_type')}")
            print(f"  • Columns: {table.get('column_count')}")
            print(f"  • Size: {table.get('size_gb')} GB (Views are virtual)")
            print(f"  • Rows: {table.get('row_count')} (Views don't store rows)")
            print()
            
            # Check if we have view definition with underlying tables
            if table.get('view_definition'):
                view_def = table['view_definition']
                print("🔍 UNDERLYING TABLE ANALYSIS:")
                print("-" * 70)
                
                # Show SQL (truncated)
                sql = view_def.get('sql', '')
                if sql:
                    print("View SQL (truncated):")
                    print("  " + sql[:200])
                    if len(sql) > 200:
                        print("  ...")
                    print()
                
                # Show underlying tables
                if view_def.get('underlying_tables'):
                    print(f"📊 UNDERLYING TABLES ({view_def.get('underlying_tables_count', 0)} found):")
                    print(f"  • Total size: {view_def.get('total_underlying_size_gb', 0)} GB")
                    print(f"  • Total rows: {view_def.get('total_underlying_rows', 0):,}")
                    print()
                    
                    for i, ut in enumerate(view_def['underlying_tables'], 1):
                        if 'error' not in ut:
                            print(f"  Table {i}: {ut.get('table_path')}")
                            print(f"    - Type: {ut.get('table_type', 'TABLE')}")
                            print(f"    - Size: {ut.get('size_gb', 0)} GB")
                            print(f"    - Rows: {ut.get('row_count', 0):,}")
                            if ut.get('partitioned'):
                                print(f"    - ✓ Partitioned on: {ut.get('partition_field')}")
                            if ut.get('clustered'):
                                print(f"    - ✓ Clustered on: {', '.join(ut.get('cluster_fields', []))}")
                            print()
                        else:
                            print(f"  Table {i}: {ut.get('table_path')}")
                            print(f"    - Error: {ut.get('error')}")
                            print()
                
                # Show optimization hints
                if view_def.get('optimization_hints'):
                    print("💡 OPTIMIZATION INSIGHTS:")
                    for hint in view_def['optimization_hints']:
                        print(f"  • {hint}")
                    print()
            else:
                print("⚠️ No underlying table information available")
                print("  (View definition might not be accessible)")
            
            print("-" * 70)
            print("✅ VIEW ANALYSIS COMPLETE")
            print()
            print("Key Benefits of Underlying Table Analysis:")
            print("  1. Understand true data volume being queried")
            print("  2. Check if base tables are optimized (partitioned/clustered)")
            print("  3. Estimate actual query costs")
            print("  4. Identify optimization opportunities")
            
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70)
print("VIEW OPTIMIZATION RECOMMENDATIONS:")
print("-" * 70)
print("1. If underlying tables are large and not partitioned:")
print("   → Consider partitioning base tables")
print("2. If view is frequently used with same filters:")
print("   → Consider creating a materialized view")
print("3. If underlying tables are clustered:")
print("   → Ensure view queries use cluster fields in WHERE/JOIN")
print("4. Monitor view query performance regularly")
print("=" * 70)