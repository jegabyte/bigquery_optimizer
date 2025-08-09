#!/bin/bash

# BigQuery Optimizer Frontend Deployment Script

echo "🚀 Deploying BigQuery Optimizer Frontend to Cloud Run..."
echo "================================================"

# Configuration
PROJECT_ID="aiva-e74f3"
REGION="us-central1"
SERVICE_NAME="bigquery-optimizer-frontend"
BACKEND_URL="https://bigquery-optimizer-backend-puql6kbaxq-uc.a.run.app"

echo "📦 Building and deploying with the following configuration:"
echo "  Project: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Service: $SERVICE_NAME"
echo "  Backend URL: $BACKEND_URL"
echo ""

# Deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --project $PROJECT_ID \
  --set-env-vars="VITE_API_URL=$BACKEND_URL"

# Get the service URL
echo ""
echo "✅ Deployment complete!"
echo ""
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --project $PROJECT_ID --format='value(status.url)')
echo "🌐 Frontend URL: $SERVICE_URL"
echo "🔗 Backend URL: $BACKEND_URL"
echo ""
echo "You can now access your BigQuery Optimizer at: $SERVICE_URL"