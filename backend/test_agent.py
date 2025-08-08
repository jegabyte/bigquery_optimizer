#!/usr/bin/env python3
"""
Test the BigQuery Optimizer Agent
This will test Vertex AI only (no mock fallback)
"""

import asyncio
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.agent import handle_request, get_status

# Test queries
TEST_QUERIES = [
    {
        "name": "Simple SELECT *",
        "query": "SELECT * FROM analytics.events",
        "expected_issues": ["SELECT_STAR", "NO_FILTER"]
    },
    {
        "name": "Query with JOIN",
        "query": """
            SELECT u.*, e.*
            FROM users u
            JOIN events e ON u.id = e.user_id
            WHERE e.date > '2024-01-01'
        """,
        "expected_issues": ["SELECT_STAR"]
    },
    {
        "name": "Optimized query",
        "query": """
            SELECT user_id, COUNT(*) as event_count
            FROM analytics.events
            WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            GROUP BY user_id
            LIMIT 100
        """,
        "expected_issues": []
    },
    {
        "name": "Public dataset query",
        "query": """
            SELECT * 
            FROM `bigquery-public-data.samples.shakespeare`
            WHERE word_count > 100
        """,
        "expected_issues": ["SELECT_STAR"]
    }
]


async def test_agent():
    """Test the agent with various queries"""
    print("=" * 70)
    print("BIGQUERY OPTIMIZER AGENT TEST")
    print("=" * 70)
    print()
    
    # First check status
    print("1. CHECKING SERVICE STATUS")
    print("-" * 40)
    status = await get_status()
    print(f"Status: {status['status']}")
    print(f"Project: {status['config']['project_id']}")
    print(f"Vertex AI: {status['services']['vertex_ai']}")
    print(f"BigQuery: {status['services']['bigquery']}")
    print()
    
    # Test each query
    print("2. TESTING QUERIES")
    print("-" * 40)
    
    for i, test in enumerate(TEST_QUERIES, 1):
        print(f"\nTest {i}: {test['name']}")
        print(f"Query: {test['query'][:50]}...")
        
        # Create request
        request = {
            "query": test["query"],
            "project_id": "aiva-e74f3",
            "validate": True
        }
        
        try:
            # Call agent
            result = await handle_request(request)
            
            # Check for errors
            if "error" in result:
                print(f"  ❌ Error: {result['error']}")
                print(f"     Message: {result.get('message', 'Unknown')}")
                if "debug" in result:
                    print(f"     Debug: {json.dumps(result['debug'], indent=6)}")
            else:
                # Success - show results
                print(f"  ✓ Service used: {result.get('service_used', 'unknown')}")
                print(f"  ✓ Issues found: {len(result.get('issues', []))}")
                
                # List issues
                for issue in result.get('issues', []):
                    print(f"     - {issue['type']} ({issue['severity']}): {issue['description'][:50]}...")
                
                # Show cost savings if available
                if result.get('validation_result'):
                    val = result['validation_result']
                    print(f"  ✓ Cost savings: {val.get('cost_savings', 0)}%")
                    print(f"     Original: ${val.get('original_cost', 0)}")
                    print(f"     Optimized: ${val.get('optimized_cost', 0)}")
                
                # Check if expected issues were found
                expected = set(test['expected_issues'])
                found = set(issue['type'] for issue in result.get('issues', []))
                
                if expected.issubset(found):
                    print(f"  ✓ Expected issues detected")
                elif expected:
                    missing = expected - found
                    print(f"  ⚠️  Missing expected issues: {missing}")
                
                # Show metadata if available
                if result.get('metadata'):
                    meta = result['metadata']
                    if meta.get('service'):
                        print(f"  ℹ️  Service used: {meta['service']}")
                
        except Exception as e:
            print(f"  ❌ Exception: {e}")
        
        print()
    
    # Summary
    print("=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    # Get final status
    final_status = await get_status()
    
    print(f"Services tested: {len(TEST_QUERIES)} queries")
    print(f"Vertex AI status: {final_status['services']['vertex_ai']}")
    print(f"BigQuery status: {final_status['services']['bigquery']}")
    
    if final_status['services'].get('errors'):
        print(f"\nRecent errors: {len(final_status['services']['errors'])}")
        for error in final_status['services']['errors'][-3:]:  # Show last 3 errors
            print(f"  - {error['service']}: {error['error'][:100]}...")
    
    print("\n📊 TEST SUMMARY")
    print("   ────────────")
    
    if final_status['services']['vertex_ai'] == 'working':
        print("   ✅ Vertex AI is operational")
        print("   The system is using real AI optimization")
    else:
        print("   ❌ Vertex AI is not available")
        print("   The system requires Vertex AI to function")
    
    return final_status


if __name__ == "__main__":
    # Run the test
    result = asyncio.run(test_agent())
    
    # Print instructions
    print("\n" + "=" * 70)
    print("NEXT STEPS")
    print("=" * 70)
    print()
    
    if result['services']['vertex_ai'] != 'working':
        print("⚠️  Vertex AI is not working. The system cannot optimize queries.")
        print()
        print("To fix this issue:")
        print("   1. Enable Vertex AI API:")
        print("      gcloud services enable aiplatform.googleapis.com")
        print()
        print("   2. Check quota and permissions:")
        print("      - Ensure your project has billing enabled")
        print("      - Verify you have Vertex AI User role")
        print()
        print("   3. Verify ADC is configured:")
        print("      gcloud auth application-default login")
        print()
        print("   4. Check if Gemini models are available in your region")
        print("      Try changing region in backend/.env (e.g., us-east1)")
        print()
        print("   ⚠️  Note: There is NO fallback. Vertex AI must be working.")
    else:
        print("✓ Vertex AI is working properly")
        print("  The system is ready for production use")
    
    print()
    print("To start the full system:")
    print("   ./start.sh")
    print()
    print("Or manually:")
    print("   Backend:  cd backend && uv run adk api_server app --port 8000")
    print("   Frontend: cd frontend && npm run dev")