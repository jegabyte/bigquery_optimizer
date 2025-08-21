"""
Configuration module for BigQuery Optimizer
Handles environment variables and ADC setup
"""

import os
from pathlib import Path
from dotenv import load_dotenv
import google.auth
from google.oauth2 import service_account

# Load environment variables
load_dotenv()

# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT = os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3"))
GOOGLE_GENAI_USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "True").lower() == "true"

# BigQuery Configuration  
BQ_PROJECT_ID = os.getenv("BQ_PROJECT_ID", GOOGLE_CLOUD_PROJECT)
BQ_DATASET = os.getenv("BQ_DATASET", "bq_optimizer")
BIGQUERY_DATASET = os.getenv("BIGQUERY_DATASET", BQ_DATASET)  # For backward compatibility
BIGQUERY_LOCATION = os.getenv("BQ_LOCATION", os.getenv("BIGQUERY_LOCATION", "US"))

# ADK Configuration
ADK_LOG_LEVEL = os.getenv("ADK_LOG_LEVEL", "INFO")
ADK_PORT = int(os.getenv("ADK_PORT", "8000"))

def get_credentials():
    """
    Get Google Cloud credentials using Application Default Credentials (ADC)
    
    Priority order:
    1. GOOGLE_APPLICATION_CREDENTIALS environment variable (if set)
    2. gcloud auth application-default login (ADC)
    3. Compute Engine/Cloud Run metadata service
    """
    try:
        # This will automatically use ADC
        credentials, project = google.auth.default(
            scopes=[
                "https://www.googleapis.com/auth/cloud-platform",
                "https://www.googleapis.com/auth/bigquery",
            ]
        )
        
        # Override project if specified in env
        if GOOGLE_CLOUD_PROJECT:
            project = GOOGLE_CLOUD_PROJECT
            
        print(f"✓ Using ADC with project: {project}")
        return credentials, project
        
    except Exception as e:
        print(f"⚠️  Error getting credentials: {e}")
        print("Please run: gcloud auth application-default login")
        return None, GOOGLE_CLOUD_PROJECT

# Initialize credentials on module load
CREDENTIALS, PROJECT_ID = get_credentials()