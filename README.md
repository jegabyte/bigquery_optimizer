# BigQuery Optimization Engine

A powerful multi-agent AI system for analyzing and optimizing BigQuery queries, featuring real-time cost analysis, performance optimization, and intelligent query rewriting.

## 📑 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [System Components](#system-components)
  - [AI Agents](#ai-agents)
- [Features](#features)
- [Local Development Setup](#local-development-setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
- [Production Deployment](#production-deployment)
  - [Google Cloud Prerequisites](#google-cloud-prerequisites)
  - [Service Account Setup](#service-account-setup)
  - [Required APIs](#required-apis)
  - [Deployment Steps](#deployment-steps)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)

## Overview

BigQuery Optimization Engine is an enterprise-grade solution that leverages Google's AI capabilities to automatically analyze, optimize, and rewrite BigQuery queries for better performance and cost efficiency. The system uses a multi-agent architecture powered by Gemini/Vertex AI to provide intelligent query optimization recommendations.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend (Vite)                  │
│    • Dashboard  • Query Analysis  • Project Analysis     │
│    • Rules Management  • Table Analysis  • Help Docs     │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP/SSE Streaming
┌─────────────────────▼────────────────────────────────────┐
│              Agent API (FastAPI - Port 8000)             │
│    • Multi-Agent Orchestration                           │  
│    • Gemini/Vertex AI Integration                        │
│    • Real-time Streaming Results                         │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│           Backend API (FastAPI - Port 8001)              │
│    • Firestore/BigQuery Storage                          │
│    • INFORMATION_SCHEMA Analysis                         │
│    • Project & Template Management                       │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│                  Google Cloud Services                   │
│    • BigQuery  • Firestore  • Vertex AI  • IAM          │
└──────────────────────────────────────────────────────────┘
```

### AI Agents

The system employs specialized AI agents for different optimization tasks:

1. **Metadata Extraction Agent**
   - Extracts table sizes, partitioning, and clustering information
   - Analyzes data distribution and access patterns

2. **Rule Analysis Agent**
   - Checks queries against BigQuery best practices
   - Identifies anti-patterns and performance issues
   - Detects opportunities for optimization

3. **Query Optimization Agent**
   - Produces optimized query versions
   - Maintains exact business logic while improving performance
   - Provides cost-benefit analysis

4. **Query Validation Agent**
   - Validates optimized queries using BigQuery dry-run
   - Ensures syntactic and semantic correctness
   - Provides detailed error reporting

## Local Development Setup

### Prerequisites

- **Node.js** 18+ and npm/yarn
- **Python** 3.11+
- **Google Cloud SDK** (`gcloud` CLI)
- **Google Cloud Project** with billing enabled
- **Service Account** with appropriate permissions

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/your-org/bigquery-optimizer.git
cd bigquery-optimizer
```

2. **Install frontend dependencies:**
```bash
cd frontend
npm install
```

3. **Install backend dependencies:**
```bash
# Agent API
cd ../agent_api
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Backend API
cd ../backend_api
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

4. **Set up environment variables:**

For detailed Agent API configuration, see [AGENT_API_DEPLOYMENT.md](./AGENT_API_DEPLOYMENT.md)

```bash
# Create .env file in project root
cat > .env << 'EOF'
# Google Cloud Core (REQUIRED)
GCP_PROJECT_ID=your-project-id
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# Authentication (choose one)
# Option 1: Service Account Key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# Option 2: Run 'gcloud auth application-default login'

# Vertex AI Configuration (REQUIRED for Agent API)
GOOGLE_GENAI_USE_VERTEXAI=True
VERTEX_AI_PROJECT=your-project-id
VERTEX_AI_LOCATION=us-central1

# BigQuery Configuration
BQ_PROJECT_ID=your-project-id
BQ_DATASET=bq_optimizer
BQ_LOCATION=US

# API URLs
BACKEND_API_URL=http://localhost:8000
AGENT_API_URL=http://localhost:8001
EOF

# Edit .env with your actual values
nano .env
```

**Important:** The Agent API requires Vertex AI to be configured. If you get "project and location must be set" errors, ensure:
1. `GCP_PROJECT_ID` and `GOOGLE_CLOUD_LOCATION` are set
2. You have authenticated (service account or `gcloud auth application-default login`)
3. Required APIs are enabled (aiplatform.googleapis.com, bigquery.googleapis.com)

### Running Locally

Use the provided script for easy local deployment:

```bash
# Make the script executable
chmod +x deploy_local.sh

# Run all services
./deploy_local.sh

# Or run specific services (foreground with logs)
./deploy_local.sh agent-api      # Start only Agent API
./deploy_local.sh backend-api    # Start only Backend API  
./deploy_local.sh frontend       # Start only Frontend

# Stop all services
./deploy_local.sh stop

# Use different backend storage
./deploy_local.sh --backend=firestore  # Use Firestore (default)
./deploy_local.sh --backend=bigquery   # Use BigQuery tables
```

Services will be available at:
- Frontend: http://localhost:3000
- Agent API: http://localhost:8000
- Backend API: http://localhost:8001

## Production Deployment

### Google Cloud Prerequisites

#### Required APIs

Enable the following APIs in your Google Cloud project:

```bash
# Core services
gcloud services enable run.googleapis.com              # Cloud Run
gcloud services enable cloudbuild.googleapis.com       # Cloud Build
gcloud services enable artifactregistry.googleapis.com # Artifact Registry
gcloud services enable firestore.googleapis.com        # Firestore
gcloud services enable appengine.googleapis.com        # App Engine (for Firestore)

# BigQuery and AI
gcloud services enable bigquery.googleapis.com         # BigQuery
gcloud services enable aiplatform.googleapis.com       # Vertex AI
gcloud services enable generativelanguage.googleapis.com # Gemini API

# Security and monitoring
gcloud services enable secretmanager.googleapis.com    # Secret Manager
gcloud services enable cloudtrace.googleapis.com       # Cloud Trace
gcloud services enable monitoring.googleapis.com       # Cloud Monitoring
gcloud services enable logging.googleapis.com          # Cloud Logging
```

### Service Account Setup

1. **Create a service account:**
```bash
gcloud iam service-accounts create bq-optimizer-sa \
    --display-name="BigQuery Optimizer Service Account" \
    --project=your-project-id
```

2. **Grant required permissions:**
```bash
# BigQuery permissions
gcloud projects add-iam-policy-binding your-project-id \
    --member="serviceAccount:bq-optimizer-sa@your-project-id.iam.gserviceaccount.com" \
    --role="roles/bigquery.admin"

# Firestore permissions
gcloud projects add-iam-policy-binding your-project-id \
    --member="serviceAccount:bq-optimizer-sa@your-project-id.iam.gserviceaccount.com" \
    --role="roles/datastore.owner"

# Vertex AI permissions
gcloud projects add-iam-policy-binding your-project-id \
    --member="serviceAccount:bq-optimizer-sa@your-project-id.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Cloud Run permissions (if deploying to Cloud Run)
gcloud projects add-iam-policy-binding your-project-id \
    --member="serviceAccount:bq-optimizer-sa@your-project-id.iam.gserviceaccount.com" \
    --role="roles/run.invoker"
```

3. **Create and download service account key:**
```bash
gcloud iam service-accounts keys create service-account.json \
    --iam-account=bq-optimizer-sa@your-project-id.iam.gserviceaccount.com
```

### Required IAM Permissions

The service account needs these specific permissions:

| Service | Permission | Purpose |
|---------|------------|---------|
| BigQuery | `bigquery.jobs.create` | Run queries and analysis |
| BigQuery | `bigquery.tables.get` | Access table metadata |
| BigQuery | `bigquery.tables.list` | List project tables |
| BigQuery | `bigquery.datasets.get` | Access dataset information |
| BigQuery | `bigquery.tables.getData` | Read table data |
| Firestore | `datastore.databases.get` | Access Firestore database |
| Firestore | `datastore.entities.create` | Store analysis results |
| Firestore | `datastore.entities.get` | Retrieve stored data |
| Firestore | `datastore.entities.list` | List stored records |
| Firestore | `datastore.entities.update` | Update records |
| Vertex AI | `aiplatform.endpoints.predict` | Use AI models |

### Deployment Steps

1. **Configure deployment environment:**
```bash
# Set environment variables
export GCP_PROJECT_ID=your-project-id
export REGION=us-central1
export SERVICE_ACCOUNT_EMAIL=bq-optimizer-sa@your-project-id.iam.gserviceaccount.com
```

2. **Build and deploy using the production script:**
```bash
# Make the script executable
chmod +x deploy-production.sh

# Deploy all services
./deploy-remote.sh

# Or deploy specific services
./deploy-remote.sh --service frontend
./deploy-remote.sh --service agent-api
./deploy-remote.sh --service backend-api
```

3. **Verify deployment:**
```bash
# Check Cloud Run services
gcloud run services list --region=$REGION

# Check App Engine (frontend)
gcloud app browse
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GCP_PROJECT_ID` | Google Cloud project ID | Required |
| `BQ_PROJECT_ID` | BigQuery project ID | Same as GCP_PROJECT_ID |
| `BQ_DATASET` | BigQuery dataset for storage | `bq_optimizer` |
| `VERTEX_AI_PROJECT` | Vertex AI project ID | Same as GCP_PROJECT_ID |
| `VERTEX_AI_LOCATION` | Vertex AI region | `us-central1` |
| `BACKEND_TYPE` | Storage backend (`firestore` or `bigquery`) | `firestore` |
| `PRICE_PER_TB` | BigQuery pricing per TB | `6.25` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `APP_ENV` | Environment (`development` or `production`) | `production` |

### Storage Backends

The system supports two storage backends:

1. **Firestore (Recommended)**
   - Better for real-time updates
   - Lower latency for small queries
   - Automatic scaling
   - No schema management required

2. **BigQuery**
   - Better for large-scale analytics
   - SQL-based querying
   - Integrated with analysis pipeline
   - Requires schema management

## Usage

### Query Analysis

1. Navigate to the Query Analysis page
2. Paste your BigQuery SQL query
3. Click "Analyze Query"
4. Review the multi-agent analysis results:
   - Metadata insights
   - Anti-pattern violations
   - Optimized query
   - Cost savings estimate

### Project Analysis

1. Go to Project Analysis
2. Click "Add Project"
3. Enter your BigQuery project ID
4. Select the region where your data resides
5. Validate permissions
6. Create the project
7. View discovered query templates and analyze them

### Table Analysis

1. Select a project from Project Analysis
2. Navigate to the "Table Analysis" tab
3. Click "Run Analysis" to scan all tables
4. Review storage costs, query patterns, and optimization opportunities

## Project Structure

```
bigquery-optimizer/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Main application pages
│   │   ├── services/       # API service layers
│   │   └── contexts/       # React contexts (auth, etc.)
│   └── package.json
│
├── agent_api/               # Multi-agent orchestration backend
│   ├── app/
│   │   ├── agents/        # Individual AI agents
│   │   ├── prompts/       # Agent prompt templates
│   │   ├── callbacks.py   # Streaming callbacks
│   │   └── main.py        # FastAPI application
│   └── requirements.txt
│
├── backend_api/            # Data management backend
│   ├── main_firestore.py  # Firestore backend
│   ├── main_bigquery.py   # BigQuery backend
│   ├── firestore_service.py
│   └── requirements.txt
│
├── deploy_local.sh         # Local development script
├── deploy-remote.sh        # Remote deployment script
└── .env.example           # Environment variables template
```

## Support

For issues, questions, or contributions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the Help section in the application

## License

[Your License Here]

