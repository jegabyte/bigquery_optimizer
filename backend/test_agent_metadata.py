#!/usr/bin/env python3
"""
Test the metadata extraction agent with various SQL queries
"""

import requests
import json
import time

# Test queries with different patterns
test_queries = [
    "SELECT * FROM bigquery-public-data.samples.shakespeare LIMIT 10",
    "SELECT a.*, b.word_count FROM `bigquery-public-data.samples.shakespeare` a JOIN bigquery-public-data.samples.github_timeline b ON a.word = b.repository_url",
    "SELECT * FROM analytics.events_* WHERE date = '2024-01-01'",
    "WITH temp AS (SELECT * FROM bigquery-public-data.samples.shakespeare) SELECT * FROM temp JOIN bigquery-public-data.samples.github_nested"
]

print("Testing Metadata Extraction Agent")
print("=" * 50)

for i, query in enumerate(test_queries, 1):
    print(f"\nTest {i}: {query[:60]}...")
    
    # Create a new session
    session_id = f"test_metadata_{i}_{int(time.time())}"
    session_response = requests.post(
        f"http://localhost:8000/apps/app/users/test_user/sessions/{session_id}",
        headers={"Content-Type": "application/json"}
    )
    
    if session_response.status_code != 200:
        print(f"✗ Failed to create session: {session_response.text}")
        continue
    
    print(f"✓ Session created: {session_id}")
    
    # Send the query to the agent (with camelCase field names)
    message = {
        "appName": "app",
        "userId": "test_user",
        "sessionId": session_id,
        "newMessage": {
            "role": "user",
            "parts": [{"text": query}]
        }
    }
    
    print("  Sending query to agent...")
    response = requests.post(
        "http://localhost:8000/run_sse",
        headers={"Content-Type": "text/event-stream"},
        json=message,
        stream=True
    )
    
    # Process SSE events
    metadata_found = False
    for line in response.iter_lines():
        if line:
            line_str = line.decode('utf-8')
            if line_str.startswith('data: '):
                try:
                    data = json.loads(line_str[6:])
                    
                    # Look for metadata extraction results
                    if 'author' in data and data['author'] == 'metadata_extractor':
                        metadata_found = True
                        if 'content' in data and 'parts' in data['content']:
                            for part in data['content']['parts']:
                                if 'text' in part:
                                    # Try to parse the JSON response
                                    try:
                                        metadata = json.loads(part['text'])
                                        print(f"  ✓ Metadata extracted:")
                                        print(f"    - Tables found: {metadata.get('tables_found', 0)}")
                                        print(f"    - Total size: {metadata.get('total_size_gb', 0)} GB")
                                        print(f"    - Total rows: {metadata.get('total_row_count', 0):,}")
                                        if 'tables' in metadata:
                                            for table in metadata['tables']:
                                                print(f"    - {table.get('table_name', 'unknown')}: {table.get('size_gb', 0)} GB, {table.get('row_count', 0):,} rows")
                                    except json.JSONDecodeError:
                                        # Not JSON yet, might be partial
                                        pass
                except json.JSONDecodeError:
                    pass
    
    if not metadata_found:
        print("  ⚠ No metadata extraction output found")
    
    # Small delay between tests
    time.sleep(2)

print("\n" + "=" * 50)
print("Test completed!")