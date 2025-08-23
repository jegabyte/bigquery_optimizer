# App Engine Deployment Prerequisites

## Overview
This document outlines all prerequisites needed to deploy the BigQuery Optimizer frontend to Google App Engine in any environment.

## Prerequisites Checklist

### 1. Google Cloud SDK
- **Required**: gcloud CLI must be installed
- **Installation**: https://cloud.google.com/sdk/docs/install
- **Verify**: `gcloud --version`

### 2. Authentication
- **Required**: Must be authenticated with Google Cloud
- **Setup**: `gcloud auth login`
- **Verify**: `gcloud auth list`

### 3. Google Cloud Project
- **Required**: Access to a GCP project with billing enabled
- **Create Project**: `gcloud projects create PROJECT_ID`
- **Enable Billing**: Visit https://console.cloud.google.com/billing
- **Set Project**: `gcloud config set project PROJECT_ID`

### 4. Required APIs
The following APIs must be enabled in your project:
- **App Engine API**: `appengine.googleapis.com`
- **Cloud Build API**: `cloudbuild.googleapis.com`

Enable them with:
```bash
gcloud services enable appengine.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 5. App Engine Initialization
- **Required**: App Engine must be initialized with a region
- **Note**: Region cannot be changed after initialization
- **Initialize**: `gcloud app create --region=REGION`

Available regions:
- `us-central` - Iowa, USA
- `us-east1` - South Carolina, USA
- `us-east4` - Northern Virginia, USA
- `us-west2` - Los Angeles, USA
- `us-west3` - Salt Lake City, USA
- `us-west4` - Las Vegas, USA
- `europe-west` - Belgium
- `europe-west2` - London, UK
- `europe-west3` - Frankfurt, Germany
- `europe-west6` - Zurich, Switzerland
- `asia-northeast1` - Tokyo, Japan
- `asia-northeast2` - Osaka, Japan
- `asia-northeast3` - Seoul, South Korea
- `asia-south1` - Mumbai, India
- `asia-southeast1` - Singapore
- `asia-southeast2` - Jakarta, Indonesia
- `australia-southeast1` - Sydney, Australia

### 6. Node.js Environment
- **Required**: Node.js 18+ and npm
- **Installation**: https://nodejs.org/
- **Verify**: `node --version` and `npm --version`

### 7. Project Permissions
Your Google account needs the following IAM roles:
- **App Engine Admin**: To deploy applications
- **Storage Admin**: To upload application files
- **Cloud Build Editor**: To build the application

Grant permissions:
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="user:YOUR_EMAIL" \
    --role="roles/appengine.appAdmin"

gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="user:YOUR_EMAIL" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="user:YOUR_EMAIL" \
    --role="roles/cloudbuild.builds.editor"
```

### 8. Required Files
The following files must exist in the frontend directory:
- `package.json` - Node.js dependencies and scripts
- `app.yaml` - App Engine configuration
- `server.js` - Express server for serving the app
- `src/` - Source code directory

## Environment Setup for New Projects

### Step 1: Clone and Navigate
```bash
git clone [repository-url]
cd bigquery-optimizer/frontend
```

### Step 2: Update Configuration
Edit `deploy-appengine.sh` and update:
```bash
PROJECT_ID="your-project-id"
BACKEND_URL="your-backend-url"
AGENT_API_URL="your-agent-api-url"
```

### Step 3: Install Dependencies
```bash
npm install
```

### Step 4: Run Deployment
```bash
./deploy-appengine.sh
```

## Automated Prerequisite Checking

The deployment script (`deploy-appengine.sh`) automatically checks all prerequisites:

1. ✅ Verifies gcloud CLI installation
2. ✅ Checks authentication status
3. ✅ Validates project access
4. ✅ Enables required APIs if needed
5. ✅ Initializes App Engine if needed
6. ✅ Verifies Node.js and npm
7. ✅ Checks for required files
8. ✅ Validates project structure

If any prerequisite is missing, the script will:
- Show a clear error message
- Provide instructions to fix the issue
- Exit before attempting deployment

## Troubleshooting Common Issues

### Issue: "The first service must be 'default'"
**Solution**: Ensure `app.yaml` doesn't specify a service name (uses default)

### Issue: "APIs not enabled"
**Solution**: Script will auto-enable APIs, or run manually:
```bash
gcloud services enable appengine.googleapis.com cloudbuild.googleapis.com
```

### Issue: "App Engine not initialized"
**Solution**: Script will prompt for region selection and initialize

### Issue: "Permission denied"
**Solution**: Check IAM permissions or contact project administrator

### Issue: "Billing account not linked"
**Solution**: Link billing account at https://console.cloud.google.com/billing

## Cost Considerations

App Engine Standard Environment pricing:
- **Free Tier**: 28 instance hours per day
- **Scales to Zero**: No charges when idle
- **Bandwidth**: 1 GB free egress per day
- **Storage**: 1 GB free

For current pricing: https://cloud.google.com/appengine/pricing

## Security Best Practices

1. **Never commit credentials**: Use environment variables
2. **Enable IAP**: For internal applications
3. **Use HTTPS**: Always enabled by default
4. **Review IAM**: Principle of least privilege
5. **Monitor logs**: Regular security audits

## Support and Resources

- **App Engine Docs**: https://cloud.google.com/appengine/docs
- **Node.js on App Engine**: https://cloud.google.com/appengine/docs/standard/nodejs
- **Troubleshooting**: https://cloud.google.com/appengine/docs/standard/nodejs/troubleshooting
- **Stack Overflow**: Tag with `google-app-engine` and `node.js`