# Agent API Deployment Configuration Guide

## Overview
The Agent API uses Google's Agent Development Kit (ADK) with Vertex AI for running optimization agents. This guide covers all configuration requirements for successful deployment.

## Required Environment Variables

### 1. Core Google Cloud Configuration

```bash
# REQUIRED: Your Google Cloud Project ID
export GCP_PROJECT_ID="your-project-id"
export GOOGLE_CLOUD_PROJECT="your-project-id"  # Alternative name

# REQUIRED: Google Cloud Location/Region for Vertex AI
export GOOGLE_CLOUD_LOCATION="us-central1"  # Must be a Vertex AI supported region

# REQUIRED for Vertex AI: Enable Vertex AI usage
export GOOGLE_GENAI_USE_VERTEXAI="True"
```

### 2. Authentication Methods

You have three options for authentication:

#### Option A: Service Account Key (Recommended for Production)
```bash
# Download service account key from GCP Console
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

#### Option B: Application Default Credentials (Local Development)
```bash
# Login with your Google account
gcloud auth application-default login

# Set the project
gcloud config set project your-project-id
```

#### Option C: Workload Identity (GKE/Cloud Run)
```bash
# Configured automatically in GCP environments
# No manual configuration needed
```

### 3. BigQuery Configuration

```bash
# BigQuery specific settings
export BQ_PROJECT_ID="your-project-id"  # Can be same as GCP_PROJECT_ID
export BQ_DATASET="bq_optimizer"        # Your BigQuery dataset name
export BQ_LOCATION="US"                 # BigQuery dataset location
```

### 4. Vertex AI Specific Configuration

```bash
# Vertex AI Project (usually same as GCP project)
export VERTEX_AI_PROJECT="your-project-id"
export VERTEX_AI_LOCATION="us-central1"

# Optional: Gemini API Key (if not using Vertex AI)
# export GEMINI_API_KEY="your-gemini-api-key"
```

### 5. API URLs (for inter-service communication)

```bash
# Backend API URL
export BACKEND_API_URL="http://localhost:8000"  # or production URL

# Agent API Port
export ADK_PORT="8001"
```

## Complete .env File Example

Create a `.env` file in the `agent_api` directory:

```env
# Google Cloud Core
GCP_PROJECT_ID=your-project-id
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# Authentication (choose one method)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Vertex AI
GOOGLE_GENAI_USE_VERTEXAI=True
VERTEX_AI_PROJECT=your-project-id
VERTEX_AI_LOCATION=us-central1

# BigQuery
BQ_PROJECT_ID=your-project-id
BQ_DATASET=bq_optimizer
BQ_LOCATION=US
BIGQUERY_DATASET=bq_optimizer  # Backward compatibility

# API Configuration
BACKEND_API_URL=http://localhost:8000
ADK_PORT=8001
ADK_LOG_LEVEL=INFO
```

## Service Account Permissions

The service account needs the following IAM roles:

```bash
# Required roles
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:your-service-account@project.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:your-service-account@project.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:your-service-account@project.iam.gserviceaccount.com" \
    --role="roles/bigquery.jobUser"

# Optional but recommended
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:your-service-account@project.iam.gserviceaccount.com" \
    --role="roles/logging.logWriter"
```

## Required Google Cloud APIs

Enable these APIs in your project:

```bash
# Enable required APIs
gcloud services enable aiplatform.googleapis.com
gcloud services enable bigquery.googleapis.com
gcloud services enable generativelanguage.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
```

## Deployment Verification

### 1. Check Environment Variables
```bash
cd agent_api
python -c "
import os
required = ['GCP_PROJECT_ID', 'GOOGLE_CLOUD_LOCATION', 'BQ_DATASET']
for var in required:
    value = os.getenv(var)
    if value:
        print(f'✓ {var} = {value}')
    else:
        print(f'✗ {var} is not set!')
"
```

### 2. Test Vertex AI Connection
```bash
python -c "
from google.cloud import aiplatform
import os

project = os.getenv('GCP_PROJECT_ID')
location = os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')

try:
    aiplatform.init(project=project, location=location)
    print(f'✓ Connected to Vertex AI in {project}/{location}')
except Exception as e:
    print(f'✗ Failed to connect: {e}')
"
```

### 3. Test BigQuery Connection
```bash
python -c "
from google.cloud import bigquery
import os

project = os.getenv('BQ_PROJECT_ID')
dataset = os.getenv('BQ_DATASET')

try:
    client = bigquery.Client(project=project)
    dataset_ref = client.dataset(dataset)
    print(f'✓ Connected to BigQuery: {project}.{dataset}')
except Exception as e:
    print(f'✗ Failed to connect: {e}')
"
```

## Common Issues and Solutions

### Issue 1: "Project and location must be set"
**Solution:** Ensure `GCP_PROJECT_ID` and `GOOGLE_CLOUD_LOCATION` are set in environment.

### Issue 2: "API key must be set"
**Solution:** Either:
- Set `GOOGLE_APPLICATION_CREDENTIALS` to service account key path
- Run `gcloud auth application-default login`
- Set `GEMINI_API_KEY` if not using Vertex AI

### Issue 3: "Permission denied" errors
**Solution:** Ensure service account has required IAM roles (see above).

### Issue 4: "API not enabled" errors
**Solution:** Enable required Google Cloud APIs (see above).

## Docker Deployment

If deploying with Docker, pass environment variables:

```bash
docker run -e GCP_PROJECT_ID=your-project \
           -e GOOGLE_CLOUD_LOCATION=us-central1 \
           -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/key.json \
           -v /path/to/key.json:/secrets/key.json \
           your-agent-api-image
```

## Cloud Run Deployment

For Cloud Run, set environment variables in deployment:

```bash
gcloud run deploy agent-api \
    --image gcr.io/your-project/agent-api \
    --set-env-vars GCP_PROJECT_ID=your-project \
    --set-env-vars GOOGLE_CLOUD_LOCATION=us-central1 \
    --set-env-vars BQ_DATASET=bq_optimizer \
    --service-account your-service-account@project.iam.gserviceaccount.com
```

## Testing the Configuration

Run this test script to verify everything is configured:

```python
#!/usr/bin/env python3
# save as test_config.py in agent_api directory

import os
import sys

def check_config():
    errors = []
    warnings = []
    
    # Check required environment variables
    required_vars = {
        'GCP_PROJECT_ID': 'Google Cloud Project ID',
        'GOOGLE_CLOUD_LOCATION': 'Vertex AI Location',
        'BQ_DATASET': 'BigQuery Dataset'
    }
    
    for var, description in required_vars.items():
        value = os.getenv(var) or os.getenv('GOOGLE_CLOUD_PROJECT')
        if not value and var == 'GCP_PROJECT_ID':
            errors.append(f"Missing {description}: Set {var} or GOOGLE_CLOUD_PROJECT")
        elif not value:
            errors.append(f"Missing {description}: Set {var}")
        else:
            print(f"✓ {var} = {value}")
    
    # Check authentication
    if not os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        warnings.append("GOOGLE_APPLICATION_CREDENTIALS not set. Using ADC or metadata service.")
    
    # Check Vertex AI settings
    if os.getenv('GOOGLE_GENAI_USE_VERTEXAI', 'True').lower() != 'true':
        if not os.getenv('GEMINI_API_KEY'):
            errors.append("GEMINI_API_KEY required when not using Vertex AI")
    
    if errors:
        print("\n❌ Configuration Errors:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    
    if warnings:
        print("\n⚠️  Warnings:")
        for warning in warnings:
            print(f"  - {warning}")
    
    print("\n✅ Configuration is valid!")
    return True

if __name__ == "__main__":
    check_config()
```

Run the test:
```bash
cd agent_api
python test_config.py
```