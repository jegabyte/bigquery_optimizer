# BigQuery Optimization Engine

A multi-agent SQL optimization system for analyzing and optimizing BigQuery queries, with support for both BigQuery and Firestore backends.

## Features

- 🚀 **Real-time Query Optimization** - Analyzes and optimizes BigQuery SQL queries
- 🤖 **AI-Powered Analysis** - Uses Gemini/Vertex AI for intelligent optimization
- 💰 **Cost Estimation** - Calculates potential cost savings
- 🔍 **Issue Detection** - Identifies common performance issues
- 📊 **Dual Backend Support** - Choose between Firestore (default) or BigQuery for data storage
- 🎯 **Multi-Agent Architecture** - Specialized agents for different optimization tasks
- 📊 **Local Data Storage** - Uses IndexedDB for offline capability
- 🔐 **Authentication Ready** - Configurable for public or private access

## Architecture

```
┌─────────────────────────────────────────┐
│            React Frontend               │
│  • Dashboard  • Query Editor  • Results │
└─────────────────┬───────────────────────┘
                  │ HTTP/Streaming
┌─────────────────▼───────────────────────┐
│         ADK Backend (Port 8000)         │
│  • Gemini/Vertex AI Integration         │
│  • BigQuery Metadata Extraction         │
│  • Query Optimization Engine            │
└─────────────────┬───────────────────────┘
                  │ BigQuery API
┌─────────────────▼───────────────────────┐
│            Google BigQuery              │
│       Project: your-project-id          │
└──────────────────────────────────────────┘
```

## 📋 Prerequisites for Deployment

### 1. Google Cloud Project Setup

#### Required APIs to Enable
Enable the following APIs in your Google Cloud project:

```bash
# Core services
gcloud services enable run.googleapis.com              # Cloud Run
gcloud services enable cloudbuild.googleapis.com       # Cloud Build
gcloud services enable appengine.googleapis.com        # App Engine
gcloud services enable artifactregistry.googleapis.com # Artifact Registry

# Data services  
gcloud services enable firestore.googleapis.com        # Firestore (default backend)
gcloud services enable bigquery.googleapis.com         # BigQuery (optional backend)

# AI/ML services
gcloud services enable aiplatform.googleapis.com       # Vertex AI (for Agent API)

# Support services
gcloud services enable iam.googleapis.com              # IAM
gcloud services enable cloudresourcemanager.googleapis.com # Resource Manager
```

#### App Engine Initialization
App Engine must be initialized before deployment:

```bash
gcloud app create --region=us-central  # Choose your preferred region
```

Available regions:
- `us-central` (Iowa)
- `us-east1` (South Carolina)  
- `us-east4` (Virginia)
- `europe-west` (Belgium)
- `europe-west2` (London)
- `asia-northeast1` (Tokyo)

### 2. Service Account Setup

Create a dedicated service account for the application:

```bash
# Create service account
gcloud iam service-accounts create bq-optimizer-sa \
    --display-name="BigQuery Optimizer Service Account" \
    --project=YOUR_PROJECT_ID

# Grant necessary roles
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:bq-optimizer-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/datastore.user"  # For Firestore access

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:bq-optimizer-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/bigquery.dataEditor"  # For BigQuery access (if using BigQuery backend)

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:bq-optimizer-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"  # For Vertex AI/Gemini access

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:bq-optimizer-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/serviceusage.serviceUsageConsumer"  # For API usage
```

### 3. Firestore Setup (Default Backend)

Create Firestore database (if not already exists):

```bash
gcloud firestore databases create \
    --location=us-central \
    --project=YOUR_PROJECT_ID
```

### 4. BigQuery Setup (Optional Backend)

If using BigQuery as backend, create the dataset:

```bash
bq mk --dataset \
    --location=US \
    --project_id=YOUR_PROJECT_ID \
    bq_optimizer
```

### 5. Development Tools

#### Required Tools
- **gcloud CLI**: [Install Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- **Python 3.11+**: Required for backend and agent APIs
- **Node.js 18+**: Required for frontend
- **npm**: Comes with Node.js
- **ADK (AI Development Kit)**: For agent API deployment

#### Install ADK
```bash
pip install google-adk
```

### 6. Environment Variables

The deployment script uses the following environment variables (with defaults):

```bash
export GCP_PROJECT_ID="your-project-id"     # Required
export REGION="us-central1"                 # Default: us-central1
export BACKEND_TYPE="firestore"             # Default: firestore (or "bigquery")
export BQ_DATASET="bq_optimizer"            # Default: bq_optimizer
export BQ_LOCATION="US"                     # Default: US
export APP_ENV="production"                 # Default: production
```

## 🚀 Deployment

### Quick Deploy

1. Clone the repository:
```bash
git clone <repository-url>
cd bigquery-optimizer
```

2. Set your project ID:
```bash
export GCP_PROJECT_ID="your-project-id"
```

3. Run the deployment script:
```bash
./deploy-production.sh
```

The script will:
- Check all prerequisites
- Deploy Agent API (with ADK)
- Deploy Backend API (Cloud Run)
- Deploy Frontend (App Engine)
- Configure CORS and authentication
- Make APIs publicly accessible

### Manual Deployment

If you prefer to deploy components individually:

#### Agent API
```bash
cd agent_api
adk deploy cloud_run \
    --project=YOUR_PROJECT_ID \
    --region=us-central1 \
    --service_name=bigquery-optimizer-agent-api \
    --allow_origins="*" \
    --with_ui \
    app

# Make publicly accessible
gcloud run services add-iam-policy-binding bigquery-optimizer-agent-api \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region=us-central1
```

#### Backend API
```bash
cd backend_api
gcloud run deploy bigquery-optimizer-backend-api \
    --source . \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars="BACKEND_TYPE=firestore,GCP_PROJECT_ID=YOUR_PROJECT_ID"
```

#### Frontend
```bash
cd frontend
npm install
npm run build
gcloud app deploy app.yaml --project=YOUR_PROJECT_ID
```

## 📁 Project Structure

```
bigquery-optimizer/
├── agent_api/          # ADK-based agent for query optimization
│   ├── app.py         # Main agent application
│   ├── config.json    # Agent configuration
│   └── requirements.txt
├── backend_api/        # Backend API service
│   ├── main_firestore.py  # Firestore backend
│   ├── main_bigquery.py   # BigQuery backend
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/           # React frontend
│   ├── src/
│   ├── package.json
│   ├── app.yaml       # App Engine configuration
│   └── vite.config.js
└── deploy-production.sh  # Main deployment script
```

## 🔧 Configuration

### Switching Backends

To switch between Firestore (default) and BigQuery:

```bash
# For Firestore (default)
export BACKEND_TYPE="firestore"

# For BigQuery
export BACKEND_TYPE="bigquery"
```

### CORS Configuration

CORS is automatically configured during deployment. To modify allowed origins:

```bash
gcloud run services update bigquery-optimizer-backend-api \
    --update-env-vars="CORS_ORIGINS=https://your-domain.com" \
    --region=us-central1
```

## 🔐 Security Notes

The current deployment makes all services publicly accessible. For production environments, consider:

1. **Enable Authentication**: Remove `--allow-unauthenticated` flags
2. **Use Service Accounts**: Configure service-to-service authentication
3. **Implement IAP**: Use Identity-Aware Proxy for frontend access
4. **Restrict CORS**: Limit to specific domains instead of "*"

## 🧹 Cleanup

To remove all deployed resources:

```bash
./deploy-production.sh --cleanup
```

This will:
- Delete Cloud Run services
- Remove App Engine versions
- Clean up Firestore data (optional)
- Delete BigQuery dataset (optional)

## 📝 Troubleshooting

### Common Issues

1. **Permission Denied on Vertex AI**
   - Ensure the service account has `roles/aiplatform.user` role
   - Wait 2-3 minutes for IAM changes to propagate
   - Restart the service: `gcloud run services update bigquery-optimizer-agent-api --region=us-central1`

2. **Firestore Permission Issues**
   - Verify Firestore is initialized in your project
   - Check service account has `roles/datastore.user` role
   - Ensure `BACKEND_TYPE=firestore` is set

3. **App Engine Not Found**
   - Initialize App Engine: `gcloud app create --region=us-central`
   - Check if App Engine API is enabled

4. **ADK Command Not Found**
   - Install ADK: `pip install google-adk`
   - Verify installation: `adk --version`

5. **Cloud Build Fails**
   - Check if Cloud Build API is enabled
   - Verify Docker/Containerfile in backend_api directory
   - Check build logs: `gcloud builds list --limit=5`

### Logs

View logs for debugging:

```bash
# Agent API logs
gcloud run logs read bigquery-optimizer-agent-api --region=us-central1

# Backend API logs
gcloud run logs read bigquery-optimizer-backend-api --region=us-central1

# Frontend logs
gcloud app logs read --service=default
```

## 📊 Monitoring

Access service URLs:
- **Frontend**: `https://YOUR_PROJECT_ID.uc.r.appspot.com`
- **Backend API**: `https://bigquery-optimizer-backend-api-*.run.app/docs`
- **Agent API**: `https://bigquery-optimizer-agent-api-*.run.app/app/`

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review Cloud Run and App Engine logs
3. Ensure all prerequisites are met
4. Verify IAM permissions are correctly configured

## 📄 License

MIT
