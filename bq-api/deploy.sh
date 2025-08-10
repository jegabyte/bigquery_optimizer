#!/bin/bash

# BigQuery API Deployment Script

PROJECT_ID="aiva-e74f3"
SERVICE_NAME="bq-api"
REGION="us-central1"

echo "Deploying BigQuery API to Google Cloud Run..."

# Build Docker image
echo "Building Docker image..."
docker build -t gcr.io/${PROJECT_ID}/${SERVICE_NAME} .

# Push to Container Registry
echo "Pushing image to Container Registry..."
docker push gcr.io/${PROJECT_ID}/${SERVICE_NAME}

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --set-env-vars BQ_PROJECT_ID=${PROJECT_ID} \
  --memory 512Mi \
  --timeout 60 \
  --max-instances 10

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "Deployment complete!"
echo "Service URL: ${SERVICE_URL}"
echo ""
echo "Update your frontend .env with:"
echo "VITE_BQ_API_URL=${SERVICE_URL}"