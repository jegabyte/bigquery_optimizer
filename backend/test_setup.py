#!/usr/bin/env python3
"""
Test script to verify ADC and project setup
"""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

def test_environment():
    """Test environment variables"""
    print("=" * 50)
    print("1. ENVIRONMENT VARIABLES")
    print("=" * 50)
    
    from dotenv import load_dotenv
    load_dotenv()
    
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "True")
    
    print(f"✓ Project ID: {project}")
    print(f"✓ Use Vertex AI: {use_vertex}")
    print()

def test_adc():
    """Test Application Default Credentials"""
    print("=" * 50)
    print("2. APPLICATION DEFAULT CREDENTIALS")
    print("=" * 50)
    
    try:
        import google.auth
        credentials, project = google.auth.default()
        print(f"✓ ADC configured successfully")
        print(f"  Project from ADC: {project}")
        print(f"  Credential type: {type(credentials).__name__}")
    except Exception as e:
        print(f"✗ ADC not configured: {e}")
        print("\nTo set up ADC, run:")
        print("  gcloud auth application-default login")
        print("  gcloud config set project aiva-e74f3")
        return False
    
    print()
    return True

def test_bigquery():
    """Test BigQuery connection"""
    print("=" * 50)
    print("3. BIGQUERY CONNECTION")
    print("=" * 50)
    
    try:
        from app.tools.bigquery_tools import get_bigquery_client
        
        client = get_bigquery_client()
        
        # Test connection
        if client.test_connection():
            print("✓ BigQuery connection successful")
            
            # List datasets
            datasets = client.list_datasets()
            print(f"  Found {len(datasets)} dataset(s): {', '.join(datasets[:3])}")
            
            # Test dry run
            test_query = "SELECT 1 as test"
            result = client.dry_run_query(test_query)
            print(f"  Dry run successful: {result.get('bytes_processed', 0)} bytes")
        else:
            print("⚠️  BigQuery connection failed (will use mock data)")
            
    except Exception as e:
        print(f"✗ BigQuery error: {e}")
        print("  The system will fall back to mock data")
    
    print()

def test_vertex_ai():
    """Test Vertex AI / Gemini connection"""
    print("=" * 50)
    print("4. VERTEX AI / GEMINI")
    print("=" * 50)
    
    try:
        from app.config import GOOGLE_CLOUD_PROJECT, GOOGLE_GENAI_USE_VERTEXAI
        
        if GOOGLE_GENAI_USE_VERTEXAI:
            print("✓ Configured to use Vertex AI with ADC")
            print(f"  Project: {GOOGLE_CLOUD_PROJECT}")
            print("  Using Application Default Credentials")
            
            # Test if we can import the genai module
            try:
                from google import genai
                print("✓ Google genai module loaded successfully")
                
                # The actual connection will be tested when running agents
                print("  Note: Actual Vertex AI connection will be tested when agents run")
            except ImportError as e:
                print(f"⚠️  Google genai module import issue: {e}")
        else:
            print("⚠️  Vertex AI disabled, using AI Studio instead")
            print("  Set GOOGLE_GENAI_USE_VERTEXAI=True to use Vertex AI")
            
    except Exception as e:
        print(f"✗ Configuration error: {e}")
        print("\nTo enable Vertex AI:")
        print("  gcloud services enable aiplatform.googleapis.com")
    
    print()

def test_agents():
    """Test ADK agents are loadable"""
    print("=" * 50)
    print("5. ADK AGENTS")
    print("=" * 50)
    
    try:
        from app.agents.orchestrator import query_optimizer_agent
        print("✓ Orchestrator agent loaded")
        
        from app.agents.metadata import metadata_extractor_agent
        print("✓ Metadata agent loaded")
        
        from app.agents.validator import rule_validator_agent
        print("✓ Validator agent loaded")
        
        from app.agents.rewriter import query_rewriter_agent
        print("✓ Rewriter agent loaded")
        
        from app.agents.verifier import result_verifier_agent
        print("✓ Verifier agent loaded")
        
    except Exception as e:
        print(f"✗ Agent loading error: {e}")
    
    print()

def main():
    print("\n" + "=" * 50)
    print("BIGQUERY OPTIMIZER SETUP TEST")
    print("=" * 50 + "\n")
    
    test_environment()
    
    if test_adc():
        test_bigquery()
        test_vertex_ai()
        test_agents()
    
    print("=" * 50)
    print("NEXT STEPS")
    print("=" * 50)
    print("\nIf all tests pass:")
    print("  1. Run the ADK server: make run")
    print("  2. Test in playground: make playground")
    print("  3. Access API at: http://localhost:8000")
    print("\nIf ADC is not configured:")
    print("  gcloud auth application-default login")
    print("  gcloud config set project aiva-e74f3")
    print("\nIf Vertex AI fails:")
    print("  gcloud services enable aiplatform.googleapis.com")
    print("  gcloud services enable bigquery.googleapis.com")

if __name__ == "__main__":
    main()