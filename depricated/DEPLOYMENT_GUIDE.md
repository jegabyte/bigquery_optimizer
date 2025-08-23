# BigQuery Optimizer - Deployment Configuration Guide

## 🚀 Deployment Options

### 1. Environment-Based Deployment

Create different environment files for each deployment scenario:

#### A. Development Environment (.env.dev)
```bash
# Development environment configuration
export GCP_PROJECT_ID=dev-project-id
export REGION=us-central1
export BQ_PROJECT_ID=${GCP_PROJECT_ID}
export BQ_DATASET=bq_optimizer_dev
export APP_ENV=development
export DEBUG=true
export LOG_LEVEL=DEBUG

# Service configuration
export BACKEND_TYPE=firestore  # or 'bigquery'
export AGENT_API_PORT=8000
export BACKEND_API_PORT=8001
export FRONTEND_PORT=3000

# Pricing
export PRICE_PER_TB=6.25

# CORS
export CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

#### B. Staging Environment (.env.staging)
```bash
# Staging environment configuration
export GCP_PROJECT_ID=staging-project-id
export REGION=us-central1
export BQ_PROJECT_ID=${GCP_PROJECT_ID}
export BQ_DATASET=bq_optimizer_staging
export APP_ENV=staging
export DEBUG=false
export LOG_LEVEL=INFO

# Service configuration
export BACKEND_TYPE=bigquery
export PRICE_PER_TB=6.25

# Service names for Cloud Run
export AGENT_API_SERVICE=bq-optimizer-agent-staging
export BACKEND_API_SERVICE=bq-optimizer-backend-staging
export FRONTEND_SERVICE=bq-optimizer-frontend-staging

# CORS for staging domain
export CORS_ORIGINS=https://staging.yourcompany.com
```

#### C. Production Environment (.env.prod)
```bash
# Production environment configuration
export GCP_PROJECT_ID=prod-project-id
export REGION=us-central1
export BQ_PROJECT_ID=${GCP_PROJECT_ID}
export BQ_DATASET=bq_optimizer
export APP_ENV=production
export DEBUG=false
export LOG_LEVEL=WARNING

# Service configuration
export BACKEND_TYPE=bigquery
export PRICE_PER_TB=6.25  # Or your negotiated price

# Service names for Cloud Run
export AGENT_API_SERVICE=bq-optimizer-agent-prod
export BACKEND_API_SERVICE=bq-optimizer-backend-prod
export FRONTEND_SERVICE=bq-optimizer-frontend-prod

# Production domains
export CORS_ORIGINS=https://optimizer.yourcompany.com

# Optional: IAP configuration
export IAP_ENABLED=true
export IAP_AUDIENCE=your-oauth-client-id
```

### 2. Deployment Commands

#### Deploy to Different Environments
```bash
# Development
source .env.dev
./deploy.sh remote

# Staging
source .env.staging
./deploy.sh remote

# Production
source .env.prod
./deploy.sh remote
```

#### Deploy with Inline Variables
```bash
# Deploy to a specific project with custom settings
GCP_PROJECT_ID=my-project \
BQ_DATASET=my_dataset \
BACKEND_TYPE=firestore \
PRICE_PER_TB=5.00 \
./deploy.sh remote
```

### 3. Backend Type Selection

Create a modified deploy script section for backend selection:

#### Update deploy.sh for Backend Selection
```bash
# Add this section to deploy.sh after environment loading

# Determine which backend to deploy
BACKEND_TYPE="${BACKEND_TYPE:-bigquery}"  # Default to BigQuery

if [ "$BACKEND_TYPE" = "firestore" ]; then
    BACKEND_MAIN_FILE="main_firestore.py"
    print_info "Using Firestore backend"
else
    BACKEND_MAIN_FILE="main.py"
    print_info "Using BigQuery backend"
fi
```

### 4. Docker-Based Deployment with Different Backends

#### Dockerfile.backend

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Copy requirements
COPY ../backend_api/requirements.txt .
RUN pip install -r requirements.txt

# Copy application code
COPY ../backend_api .

# Use environment variable to determine which main file to run
ENV BACKEND_TYPE=${BACKEND_TYPE:-bigquery}

# Start script that chooses the right main file
CMD if [ "$BACKEND_TYPE" = "firestore" ]; then \
        python main_firestore.py; \
    else \
        python main.py; \
    fi
```

### 5. Cloud Run Deployment with Environment Variables

```bash
# Deploy backend with specific configuration
gcloud run deploy bigquery-optimizer-backend \
    --source backend_api \
    --region $REGION \
    --project $GCP_PROJECT_ID \
    --set-env-vars="
        GCP_PROJECT_ID=$GCP_PROJECT_ID,
        BQ_PROJECT_ID=$BQ_PROJECT_ID,
        BQ_DATASET=$BQ_DATASET,
        BACKEND_TYPE=$BACKEND_TYPE,
        PRICE_PER_TB=$PRICE_PER_TB,
        APP_ENV=$APP_ENV,
        LOG_LEVEL=$LOG_LEVEL,
        CORS_ORIGINS=$CORS_ORIGINS
    " \
    --allow-unauthenticated
```

### 6. Multi-Project Deployment Script

Create a script for deploying to multiple projects:

#### deploy-multi.sh
```bash
#!/bin/bash

# Define your projects
declare -A PROJECTS=(
    ["dev"]="dev-project-id"
    ["staging"]="staging-project-id"
    ["prod"]="prod-project-id"
)

# Define configurations per environment
declare -A DATASETS=(
    ["dev"]="bq_optimizer_dev"
    ["staging"]="bq_optimizer_staging"
    ["prod"]="bq_optimizer"
)

declare -A BACKEND_TYPES=(
    ["dev"]="firestore"
    ["staging"]="bigquery"
    ["prod"]="bigquery"
)

# Deploy to specific environment
ENVIRONMENT=$1

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: ./deploy-multi.sh [dev|staging|prod]"
    exit 1
fi

# Set configuration for selected environment
export GCP_PROJECT_ID=${PROJECTS[$ENVIRONMENT]}
export BQ_DATASET=${DATASETS[$ENVIRONMENT]}
export BACKEND_TYPE=${BACKEND_TYPES[$ENVIRONMENT]}
export APP_ENV=$ENVIRONMENT

# Deploy
./deploy.sh remote
```

### 7. Service Account Configuration per Environment

```bash
# Create service accounts for each environment
gcloud iam service-accounts create bq-optimizer-dev \
    --display-name="BQ Optimizer Dev" \
    --project=dev-project-id

gcloud iam service-accounts create bq-optimizer-staging \
    --display-name="BQ Optimizer Staging" \
    --project=staging-project-id

gcloud iam service-accounts create bq-optimizer-prod \
    --display-name="BQ Optimizer Production" \
    --project=prod-project-id
```

### 8. GitHub Actions for Different Environments

#### .github/workflows/deploy.yml
```yaml
name: Deploy to GCP

on:
  push:
    branches:
      - main
      - staging
      - develop

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Set environment based on branch
      run: |
        if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
          echo "ENVIRONMENT=prod" >> $GITHUB_ENV
          echo "GCP_PROJECT_ID=prod-project-id" >> $GITHUB_ENV
          echo "BACKEND_TYPE=bigquery" >> $GITHUB_ENV
        elif [[ "${{ github.ref }}" == "refs/heads/staging" ]]; then
          echo "ENVIRONMENT=staging" >> $GITHUB_ENV
          echo "GCP_PROJECT_ID=staging-project-id" >> $GITHUB_ENV
          echo "BACKEND_TYPE=bigquery" >> $GITHUB_ENV
        else
          echo "ENVIRONMENT=dev" >> $GITHUB_ENV
          echo "GCP_PROJECT_ID=dev-project-id" >> $GITHUB_ENV
          echo "BACKEND_TYPE=firestore" >> $GITHUB_ENV
        fi
    
    - name: Deploy to GCP
      run: |
        source .env.${{ env.ENVIRONMENT }}
        ./deploy.sh remote
```

### 9. Configuration Management Best Practices

#### Use Secret Manager for Sensitive Data
```bash
# Store sensitive config in Secret Manager
echo -n "$IAP_AUDIENCE" | gcloud secrets create iap-audience --data-file=-

# Reference in Cloud Run
gcloud run services update bigquery-optimizer-backend \
    --update-secrets=IAP_AUDIENCE=iap-audience:latest
```

#### Environment-Specific BigQuery Tables
```sql
-- Development
CREATE SCHEMA IF NOT EXISTS `dev-project.bq_optimizer_dev`;

-- Staging  
CREATE SCHEMA IF NOT EXISTS `staging-project.bq_optimizer_staging`;

-- Production
CREATE SCHEMA IF NOT EXISTS `prod-project.bq_optimizer`;
```

### 10. Quick Deployment Examples

```bash
# 1. Deploy dev with Firestore backend
source .env.dev
BACKEND_TYPE=firestore ./deploy.sh remote

# 2. Deploy staging with BigQuery backend
source .env.staging
BACKEND_TYPE=bigquery ./deploy.sh remote

# 3. Deploy prod with custom pricing
source .env.prod
PRICE_PER_TB=5.00 ./deploy.sh remote

# 4. Deploy to different region
REGION=europe-west1 ./deploy.sh remote

# 5. Deploy with debug logging
LOG_LEVEL=DEBUG APP_ENV=development ./deploy.sh remote

# 6. Deploy frontend only
./deploy.sh remote-frontend

# 7. Deploy backend only with specific type
BACKEND_TYPE=firestore ./deploy.sh remote-backend-api

# 8. Deploy to custom project
GCP_PROJECT_ID=my-custom-project \
BQ_DATASET=my_custom_dataset \
./deploy.sh remote
```

## 🔧 Troubleshooting Deployments

### Check Current Configuration
```bash
# Add this function to deploy.sh
check_config() {
    echo "Current Configuration:"
    echo "  GCP_PROJECT_ID: $GCP_PROJECT_ID"
    echo "  BQ_DATASET: $BQ_DATASET"
    echo "  BACKEND_TYPE: $BACKEND_TYPE"
    echo "  APP_ENV: $APP_ENV"
    echo "  PRICE_PER_TB: $PRICE_PER_TB"
    echo "  REGION: $REGION"
}

# Run: ./deploy.sh check-config
```

### Rollback Deployment
```bash
# List revisions
gcloud run revisions list --service=bigquery-optimizer-backend

# Rollback to previous revision
gcloud run services update-traffic bigquery-optimizer-backend \
    --to-revisions=PREVIOUS_REVISION_ID=100
```

## 📝 Summary

Use environment files (.env.dev, .env.staging, .env.prod) to manage different configurations and deploy using:

```bash
source .env.<environment>
./deploy.sh remote
```

This approach gives you complete control over:
- Which GCP project to deploy to
- Which backend type to use (BigQuery vs Firestore)
- Pricing configurations
- Dataset names
- Service names
- CORS origins
- Logging levels
- IAP settings
