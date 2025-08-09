#!/usr/bin/env python3
"""
Test that the metadata_extractor agent returns complete view information
"""

import json
import asyncio
from app.agents.metadata_extractor import metadata_extractor

# Test with a VIEW query
query = "SELECT * FROM `aiva-e74f3.firebase_exports.users_view` LIMIT 1000"

print("Testing metadata_extractor agent with VIEW query")
print("=" * 70)
print(f"Query: {query}")
print()

async def test_agent():
    # Run the metadata extractor
    result = await metadata_extractor.invoke(
        input_data={"query": query}
    )
    
    print("Agent Response:")
    print("-" * 70)
    
    # Get the metadata output
    metadata_output = result.get('metadata_output', '')
    
    # Try to parse as JSON
    try:
        metadata = json.loads(metadata_output)
        print(json.dumps(metadata, indent=2))
        
        # Check if view_definition is included
        print()
        print("Analysis:")
        print("-" * 70)
        
        for table in metadata.get('tables', []):
            table_name = table.get('table_name')
            table_type = table.get('table_type', 'Unknown')
            
            print(f"Table: {table_name}")
            print(f"Type: {table_type}")
            
            if 'view_definition' in table:
                view_def = table['view_definition']
                print("✅ VIEW DEFINITION FOUND:")
                print(f"  - Underlying tables: {view_def.get('underlying_tables_count', 0)}")
                print(f"  - Total underlying size: {view_def.get('total_underlying_size_gb', 0)} GB")
                print(f"  - Total underlying rows: {view_def.get('total_underlying_rows', 0):,}")
                
                if view_def.get('underlying_tables'):
                    print("  - Base tables:")
                    for ut in view_def['underlying_tables']:
                        print(f"    • {ut.get('table_name')} ({ut.get('size_gb')} GB, {ut.get('row_count'):,} rows)")
            else:
                if table_type == "VIEW":
                    print("❌ VIEW DEFINITION MISSING - This is the problem!")
                else:
                    print("  (No view definition - this is a regular table)")
                    
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {e}")
        print("Raw output:")
        print(metadata_output)

# Run the async test
asyncio.run(test_agent())