# BigQuery Optimizer - Cloud Run Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the BigQuery Optimizer application to Google Cloud Run. The application consists of:

- **Backend**: ADK-based agent service for query optimization
- **Frontend**: React-based web interface for user interaction

## Prerequisites

### Required Tools

1. **Google Cloud SDK**
   ```bash
   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   gcloud init
   ```

2. **Docker**
   - Install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop)

3. **Python 3.10+**
   ```bash
   python3 --version  # Should be 3.10 or higher
   ```

4. **Node.js 18+** (for frontend build)
   ```bash
   node --version  # Should be 18.0 or higher
   npm --version   # Should be 8.0 or higher
   ```

5. **ADK CLI**
   ```bash
   pip install google-adk
   ```

### Google Cloud Setup

1. **Create a Google Cloud Project**
   ```bash
   gcloud projects create YOUR_PROJECT_ID --name="BigQuery Optimizer"
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Enable Billing**
   - Visit [Cloud Console](https://console.cloud.google.com/billing)
   - Link a billing account to your project

3. **Enable Required APIs**
   ```bash
   gcloud services enable \
     run.googleapis.com \
     artifactregistry.googleapis.com \
     cloudbuild.googleapis.com \
     bigquery.googleapis.com \
     aiplatform.googleapis.com
   ```

4. **Authentication**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

## Environment Variables

Create a `.env` file in the project root:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=True

# Optional: If using AI Studio instead of Vertex AI
# GOOGLE_GENAI_USE_VERTEXAI=False
# GOOGLE_API_KEY=your-api-key

# Deployment Configuration
SERVICE_NAME_BACKEND=bigquery-optimizer-backend
SERVICE_NAME_FRONTEND=bigquery-optimizer-frontend
APP_NAME=bigquery-optimizer
ARTIFACT_REGISTRY_REPO=bigquery-optimizer

# Resource Configuration
CPU=2
MEMORY=4Gi
MAX_INSTANCES=10
MIN_INSTANCES=0
TIMEOUT=600

# Security
ALLOW_UNAUTHENTICATED=false  # Set to true for public access
```

## Deployment Scripts

### Quick Deployment

```bash
# Make scripts executable
chmod +x deploy.sh destroy.sh

# Deploy everything (backend + frontend)
./deploy.sh --project YOUR_PROJECT_ID --region us-central1

# Deploy with public access
./deploy.sh --project YOUR_PROJECT_ID --allow-unauthenticated

# Deploy backend only
./deploy.sh --project YOUR_PROJECT_ID --backend-only

# Deploy frontend only
./deploy.sh --project YOUR_PROJECT_ID --frontend-only
```

### Manual Deployment Steps

#### 1. Backend Deployment

```bash
cd backend

# Using ADK CLI (Recommended)
adk deploy cloud_run \
  --project=$GOOGLE_CLOUD_PROJECT \
  --region=$GOOGLE_CLOUD_LOCATION \
  --service_name=bigquery-optimizer-backend \
  --app_name=bigquery-optimizer \
  --with_ui \
  .

# Get the backend URL
BACKEND_URL=$(gcloud run services describe bigquery-optimizer-backend \
  --region=us-central1 \
  --format='value(status.url)')
```

#### 2. Frontend Deployment

```bash
cd frontend

# Set backend URL in environment
echo "VITE_API_URL=$BACKEND_URL" > .env.production

# Build frontend
npm install
npm run build

# Create Dockerfile
cat > Dockerfile << EOF
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
EOF

# Build and push Docker image
docker build -t gcr.io/$GOOGLE_CLOUD_PROJECT/bigquery-optimizer-frontend .
docker push gcr.io/$GOOGLE_CLOUD_PROJECT/bigquery-optimizer-frontend

# Deploy to Cloud Run
gcloud run deploy bigquery-optimizer-frontend \
  --image=gcr.io/$GOOGLE_CLOUD_PROJECT/bigquery-optimizer-frontend \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated
```

## Service Configuration

### IAM Permissions

The service account requires the following roles:

```bash
# Create service account
gcloud iam service-accounts create bigquery-optimizer-sa \
  --display-name="BigQuery Optimizer Service Account"

# Grant permissions
PROJECT_ID=your-project-id
SERVICE_ACCOUNT=bigquery-optimizer-sa@$PROJECT_ID.iam.gserviceaccount.com

# BigQuery permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/bigquery.jobUser"

# Vertex AI permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/aiplatform.user"

# Cloud Trace permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudtrace.agent"

# Attach to Cloud Run service
gcloud run services update bigquery-optimizer-backend \
  --region=us-central1 \
  --service-account=$SERVICE_ACCOUNT
```

### Resource Limits

Configure Cloud Run resources:

```bash
gcloud run services update bigquery-optimizer-backend \
  --region=us-central1 \
  --cpu=2 \
  --memory=4Gi \
  --max-instances=10 \
  --min-instances=0 \
  --timeout=600 \
  --concurrency=100
```

## Testing the Deployment

### Backend API

```bash
# Get service URL
BACKEND_URL=$(gcloud run services describe bigquery-optimizer-backend \
  --region=us-central1 \
  --format='value(status.url)')

# Test health endpoint
curl $BACKEND_URL/health

# Test with authentication (if required)
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" $BACKEND_URL/health

# Access ADK UI
open $BACKEND_URL/docs
```

### Frontend Application

```bash
# Get frontend URL
FRONTEND_URL=$(gcloud run services describe bigquery-optimizer-frontend \
  --region=us-central1 \
  --format='value(status.url)')

# Open in browser
open $FRONTEND_URL
```

### Test Query Optimization

```bash
# Send a test query
curl -X POST $BACKEND_URL/apps/bigquery-optimizer/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM `project.dataset.large_table`"
  }'
```

## Monitoring and Logging

### View Logs

```bash
# Backend logs
gcloud run logs read \
  --service=bigquery-optimizer-backend \
  --region=us-central1 \
  --limit=50

# Frontend logs
gcloud run logs read \
  --service=bigquery-optimizer-frontend \
  --region=us-central1 \
  --limit=50

# Stream logs in real-time
gcloud run logs tail \
  --service=bigquery-optimizer-backend \
  --region=us-central1
```

### Metrics

```bash
# View metrics in Cloud Console
gcloud monitoring dashboards list
gcloud monitoring metrics-descriptors list --filter="metric.type:run.googleapis.com"
```

### Cloud Trace

Access traces at: https://console.cloud.google.com/traces

## Cleanup

To remove all deployed resources:

```bash
# Remove everything
./destroy.sh --project YOUR_PROJECT_ID --region us-central1

# Force deletion without confirmation
./destroy.sh --project YOUR_PROJECT_ID --force
```

Manual cleanup:

```bash
# Delete Cloud Run services
gcloud run services delete bigquery-optimizer-backend --region=us-central1
gcloud run services delete bigquery-optimizer-frontend --region=us-central1

# Delete Artifact Registry
gcloud artifacts repositories delete bigquery-optimizer --location=us-central1

# Delete service account
gcloud iam service-accounts delete bigquery-optimizer-sa@PROJECT_ID.iam.gserviceaccount.com
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   ```bash
   # Re-authenticate
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Permission Denied**
   ```bash
   # Check service account permissions
   gcloud projects get-iam-policy $PROJECT_ID \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:bigquery-optimizer-sa@*"
   ```

3. **Container Build Failures**
   ```bash
   # Check Docker daemon
   docker ps
   
   # Clean Docker cache
   docker system prune -a
   ```

4. **Backend Connection Issues**
   ```bash
   # Check CORS settings
   gcloud run services describe bigquery-optimizer-backend \
     --region=us-central1 \
     --format="value(spec.template.metadata.annotations)"
   ```

### Debug Mode

Enable detailed logging:

```bash
# Update environment variables
gcloud run services update bigquery-optimizer-backend \
  --region=us-central1 \
  --set-env-vars="LOG_LEVEL=DEBUG,ENABLE_TRACING=true"
```

## Cost Optimization

### Recommendations

1. **Use minimum instances = 0** for development
2. **Set appropriate CPU and memory limits**
3. **Configure autoscaling based on usage**
4. **Use Cloud Scheduler for periodic tasks**
5. **Enable request timeout to prevent hanging requests**

### Estimated Costs

- **Cloud Run**: ~$0.00002400 per vCPU-second
- **Memory**: ~$0.00000250 per GiB-second
- **Requests**: $0.40 per million requests
- **Artifact Registry**: $0.10 per GB per month
- **Vertex AI**: Based on model usage

## Security Best Practices

1. **Use Service Accounts** with minimal permissions
2. **Enable VPC Service Controls** for network isolation
3. **Use Secret Manager** for sensitive configuration
4. **Enable Cloud Armor** for DDoS protection
5. **Configure HTTPS only** with managed certificates
6. **Implement request authentication** for production

## Support

For issues or questions:

1. Check [Cloud Run documentation](https://cloud.google.com/run/docs)
2. Review [ADK documentation](https://cloud.google.com/generative-ai-studio/docs/adk)
3. Open an issue in the project repository
4. Contact Google Cloud Support (if applicable)

## Next Steps

After deployment:

1. Configure custom domain
2. Set up monitoring alerts
3. Implement CI/CD pipeline
4. Configure backup strategies
5. Set up load testing
6. Review and optimize costs