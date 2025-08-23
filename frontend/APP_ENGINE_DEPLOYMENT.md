# App Engine Frontend Deployment Guide

## Overview
This guide explains how to deploy the BigQuery Optimizer frontend to Google App Engine instead of Cloud Run.

## Prerequisites
- Google Cloud SDK (`gcloud`) installed and configured
- Node.js 20+ installed
- Access to the GCP project (`aiva-e74f3`)

## Files Created for App Engine Deployment

### 1. `app.yaml`
App Engine configuration file that defines:
- Runtime: Node.js 20
- Service name: frontend
- Static file handlers for the built React app
- Auto-scaling configuration

### 2. `server.js`
Express server for serving the static React build:
- Serves static files from the `dist` directory
- Handles SPA routing (all routes return index.html)
- Health check endpoint at `/health`
- Listens on port 8080 (or PORT env variable)

### 3. `deploy-appengine.sh`
Deployment script that:
- Sets environment variables for the build
- Builds the React app with production settings
- Deploys to App Engine

### 4. Updated `package.json`
Added two new scripts:
- `"start": "node server.js"` - Required by App Engine to start the server
- `"gcp-build": "npm run build"` - Automatically runs during App Engine deployment

## Deployment Process

### Option 1: Using the Deployment Script
```bash
cd frontend
./deploy-appengine.sh
```

### Option 2: Manual Deployment
```bash
cd frontend

# Set environment variables for build
export VITE_API_URL=https://bigquery-optimizer-agent-api-puql6kbaxq-uc.a.run.app
export VITE_BACKEND_API_URL=https://bigquery-optimizer-backend-puql6kbaxq-uc.a.run.app
export VITE_BQ_API_URL=https://bigquery-optimizer-backend-puql6kbaxq-uc.a.run.app
export VITE_GCP_PROJECT_ID=aiva-e74f3

# Install dependencies and build
npm install
npm run build

# Deploy to App Engine
gcloud app deploy app.yaml --project=aiva-e74f3 --quiet
```

## Key Differences from Cloud Run

### URL Structure
- **Cloud Run**: `https://bigquery-optimizer-frontend-puql6kbaxq-uc.a.run.app`
- **App Engine**: `https://frontend-dot-aiva-e74f3.us-central1.r.appspot.com`

### Deployment Method
- **Cloud Run**: Uses Dockerfile with nginx
- **App Engine**: Uses app.yaml with Express server

### Build Process
- **Cloud Run**: Multi-stage Docker build
- **App Engine**: Local build then upload, or use `gcp-build` script

### Environment Variables
- **Cloud Run**: Set via `--set-env-vars` flag
- **App Engine**: Build-time variables, runtime served as static files

## Architecture Notes

### Static File Serving
App Engine efficiently serves static files directly without going through the Node.js server, improving performance for assets.

### SPA Routing
The Express server handles client-side routing by serving `index.html` for all unmatched routes, enabling React Router to work correctly.

### Scaling
App Engine Standard automatically scales based on traffic:
- Min instances: 0 (scales to zero when idle)
- Max instances: 10
- Target CPU utilization: 60%

## Monitoring and Logs

### View Application
```bash
gcloud app browse -s frontend
```

### View Logs
```bash
gcloud app logs tail -s frontend
```

### View Deployed Versions
```bash
gcloud app versions list -s frontend
```

## Rollback
If needed, you can rollback to a previous version:
```bash
gcloud app versions list -s frontend
gcloud app services set-traffic frontend --splits=<VERSION>=1
```

## Important Considerations

1. **No Code Changes Required**: The React application code remains unchanged. Only deployment configuration is different.

2. **Backend Connectivity**: The frontend still connects to the backend services running on Cloud Run. Update the URLs in the deployment script if backend services move to App Engine.

3. **CORS Configuration**: Ensure backend services allow requests from the new App Engine domain.

4. **Costs**: App Engine Standard can scale to zero, potentially reducing costs during idle periods.

5. **Performance**: App Engine provides automatic scaling and CDN integration for static assets.

## Troubleshooting

### Build Fails
- Check Node.js version compatibility (requires 20+)
- Verify all dependencies are in package.json
- Check build logs: `gcloud app logs read -s frontend`

### 404 Errors
- Verify app.yaml handlers are correct
- Check that dist folder contains built files
- Ensure server.js is handling SPA routing

### Connection Issues
- Verify backend URLs are correct
- Check CORS settings on backend services
- Review browser console for errors

## Next Steps

To deploy backend services to App Engine as well:
1. Create similar app.yaml files for backend services
2. Modify Python services to work with App Engine
3. Update service URLs in frontend configuration

Note: The Agent API using Google ADK must remain on Cloud Run as ADK doesn't support App Engine deployment.