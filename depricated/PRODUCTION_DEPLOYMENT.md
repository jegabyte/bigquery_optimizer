# Production Deployment Guide

## Overview
This guide explains how to deploy the BigQuery Optimizer to production using the unified deployment script that handles all three services:
- **Agent API** → Cloud Run (via ADK)
- **Backend API** → Cloud Run  
- **Frontend** → App Engine

## Quick Start

### Deploy Everything
```bash
./deploy-production.sh
```

### Deploy with Options
```bash
# With specific project
./deploy-production.sh --project=my-project-id

# With BigQuery backend (instead of default Firestore)
./deploy-production.sh --backend=bigquery

# With different region
./deploy-production.sh --region=europe-west1
```

## Prerequisites

The script automatically checks all prerequisites:

### 1. **Google Cloud SDK**
- Must have `gcloud` CLI installed
- Installation: https://cloud.google.com/sdk/docs/install

### 2. **Authentication**
```bash
gcloud auth login
gcloud auth application-default login
```

### 3. **Project Setup**
- Valid GCP project with billing enabled
- Required APIs (auto-enabled by script):
  - Cloud Run API
  - Cloud Build API
  - App Engine API
  - Firestore API
  - BigQuery API
  - Artifact Registry API

### 4. **App Engine**
- Must be initialized with a region
- Script will prompt if not initialized

### 5. **Development Tools**
- Python 3.10+ (for backend services)
- Node.js 18+ and npm (for frontend)
- ADK (auto-installed by script if missing)

## Configuration

### Environment Variables
Create a `.env` file in the project root:
```bash
GCP_PROJECT_ID=your-project-id
REGION=us-central1
BQ_PROJECT_ID=your-bq-project
BQ_DATASET=bq_optimizer
BACKEND_TYPE=firestore  # default, or set to 'bigquery'
APP_ENV=production
```

### Command Line Options
```bash
--project=PROJECT_ID    # Override GCP project
--region=REGION        # Override deployment region
--backend=TYPE         # Backend type: firestore (default) or bigquery
--skip-checks          # Skip prerequisite checks (risky)
--cleanup              # Remove all deployed resources (with confirmation)
--force-cleanup        # Remove all resources without confirmation (dangerous!)
--help                 # Show help message
```

## Deployment Process

### 1. **Agent API Deployment**
- Uses Google ADK (Agent Development Kit)
- Deploys to Cloud Run
- Provides AI-powered optimization capabilities
- Sets up API endpoints and UI interface

### 2. **Backend API Deployment**
- Deploys FastAPI service to Cloud Run
- Supports dual backends:
  - **Firestore**: Document database storage (default)
  - **BigQuery**: Direct table storage (optional)
- Handles data persistence and business logic

### 3. **Frontend Deployment**
- Builds React application
- Deploys to App Engine as default service
- Serves static assets efficiently
- Connects to both APIs automatically

### 4. **Service Integration**
- Updates CORS configurations
- Sets service URLs in environment variables
- Establishes inter-service authentication

## Service Architecture

```
┌─────────────────┐
│    Frontend     │ ← App Engine (default service)
│  (React + Vite) │   https://project.region.r.appspot.com
└────────┬────────┘
         │
    ┌────┴─────┐
    ▼          ▼
┌──────────┐  ┌──────────┐
│ Agent API│  │Backend API│ ← Cloud Run Services
│   (ADK)  │  │ (FastAPI) │   https://service-region.a.run.app
└──────────┘  └──────────┘
               │
          ┌────┴─────┐
          ▼          ▼
    ┌─────────┐ ┌──────────┐
    │BigQuery │ │Firestore │ ← Data Storage
    └─────────┘ └──────────┘
```

## Deployment Verification

The script automatically verifies:
1. ✅ All services deployed successfully
2. ✅ Health checks pass (HTTP 200)
3. ✅ Inter-service communication works
4. ✅ Frontend can reach both APIs

## Post-Deployment

### Access Your Application
```bash
# Open frontend
open https://your-project.region.r.appspot.com

# View Agent API docs
open https://agent-api-service.region.a.run.app/docs

# View Backend API docs  
open https://backend-api-service.region.a.run.app/docs
```

### Monitor Services
```bash
# Frontend logs
gcloud app logs tail

# Agent API logs
gcloud run logs read --service=bigquery-optimizer-agent-api

# Backend API logs
gcloud run logs read --service=bigquery-optimizer-backend-api
```

### Service Management
```bash
# List all services
gcloud run services list
gcloud app services list

# Update service
gcloud run services update SERVICE_NAME --region=REGION

# Delete services (careful!)
gcloud run services delete SERVICE_NAME --region=REGION
```

## Troubleshooting

### Common Issues

#### 1. **"First service must be default"**
- App Engine requires the first service to be named 'default'
- The script handles this automatically

#### 2. **"APIs not enabled"**
- Script auto-enables required APIs
- May need to wait 1-2 minutes for activation

#### 3. **"ADK not found"**
- Script auto-installs ADK in virtual environment
- Manual install: `pip install google-adk`

#### 4. **"Build failed"**
- Check Node.js version (requires 18+)
- Clear cache: `rm -rf node_modules dist`
- Reinstall: `npm install`

#### 5. **"Permission denied"**
- Ensure proper IAM roles:
  - Cloud Run Admin
  - App Engine Admin
  - Storage Admin
  - Cloud Build Editor

### Debug Mode
```bash
# Run with verbose output
set -x
./deploy-production.sh
```

### Rollback
```bash
# List versions
gcloud app versions list
gcloud run revisions list --service=SERVICE_NAME

# Rollback App Engine
gcloud app versions migrate OLD_VERSION

# Rollback Cloud Run
gcloud run services update-traffic SERVICE_NAME --to-revisions=OLD_REVISION=100
```

## Security Considerations

### 1. **Authentication**
- Cloud Run services are public by default
- Consider adding IAP or authentication for production

### 2. **CORS Configuration**
- Script sets appropriate CORS headers
- Adjust for your domain requirements

### 3. **Environment Variables**
- Never commit `.env` files
- Use Secret Manager for sensitive data

### 4. **API Keys**
- Rotate regularly
- Use service accounts with minimal permissions

## Cost Optimization

### App Engine
- Scales to zero when idle
- Free tier: 28 instance hours/day
- Use `min_instances: 0` in app.yaml

### Cloud Run
- Billed per request
- Set appropriate memory limits
- Use concurrency settings

### BigQuery
- Use partitioned tables
- Set up cost controls
- Monitor query costs

## Advanced Configuration

### Custom Domains
```bash
# App Engine
gcloud app domain-mappings create DOMAIN

# Cloud Run
gcloud run domain-mappings create --service=SERVICE --domain=DOMAIN
```

### Load Balancing
```bash
# Set up Cloud Load Balancer for Cloud Run
gcloud compute backend-services create BACKEND_NAME
```

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Deploy Production
  run: |
    ./deploy-production.sh --skip-checks
  env:
    GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
```

## Monitoring & Logging

### Cloud Monitoring
```bash
# Set up alerts
gcloud alpha monitoring policies create --notification-channels=CHANNEL
```

### Error Reporting
```bash
# View errors
gcloud beta error-reporting events list
```

### Performance Monitoring
- Frontend: Use Web Vitals
- APIs: Use Cloud Trace
- Database: Use Query Insights

## Support

### Documentation
- App Engine: https://cloud.google.com/appengine/docs
- Cloud Run: https://cloud.google.com/run/docs
- ADK: https://cloud.google.com/adk/docs

### Getting Help
- Check deployment logs: `deployment-info.txt`
- Review script output for specific errors
- Contact support with project ID and error messages

## Resource Cleanup

### Complete Cleanup
The script includes a comprehensive cleanup option to remove all deployed resources:

```bash
# With confirmation prompts
./deploy-production.sh --cleanup

# Force cleanup without confirmation (dangerous!)
./deploy-production.sh --force-cleanup

# Cleanup specific project
./deploy-production.sh --cleanup --project=my-project-id
```

### What Gets Deleted

#### ✅ Fully Removed:
- **Cloud Run Services**
  - Agent API service
  - Backend API service
  - All associated revisions
  
- **App Engine Versions**
  - All deployed versions
  - Traffic allocations
  
- **Firestore Data** (if using Firestore backend)
  - All collections: projects, templates, analyses, optimization_rules, query_patterns
  - All documents within collections
  
- **BigQuery Dataset** (if using BigQuery backend)
  - Complete dataset and all tables
  
- **Cloud Storage**
  - Build artifacts
  - Staging files
  
- **Container Registry**
  - Service images
  - All image tags

#### ⚠️ Cannot Be Deleted (GCP Limitations):
- **App Engine Application** - Once created, cannot be deleted (only disabled)
- **Firestore Database Structure** - Database itself remains (empty)
- **Project-level configurations** - IAM, APIs, etc.

### Safety Features

1. **Double Confirmation**
   - Must type `DELETE ALL` to confirm
   - Additional confirmation for production environments

2. **Resource Preview**
   - Shows all resources that will be deleted
   - Lists project and region for verification

3. **Error Handling**
   - Continues cleanup even if some deletions fail
   - Reports summary with error count

### Complete Project Deletion
To remove absolutely everything including App Engine and Firestore:
```bash
# Nuclear option - deletes entire project
gcloud projects delete PROJECT_ID
```

⚠️ **WARNING**: Project deletion is permanent and removes ALL resources, not just BigQuery Optimizer.

## Next Steps

1. **Set up monitoring** - Configure alerts and dashboards
2. **Add authentication** - Implement IAP or custom auth
3. **Configure CI/CD** - Automate deployments
4. **Optimize performance** - Tune instance settings
5. **Set up backups** - Regular data exports
6. **Document APIs** - Update OpenAPI specs
7. **Load testing** - Verify scalability