# BigQuery Optimizer

AI-powered BigQuery query optimization tool using Google's ADK (Agent Development Kit) and Vertex AI.

## Features

- 🚀 **Real-time Query Optimization** - Analyzes and optimizes BigQuery SQL queries
- 🤖 **AI-Powered Analysis** - Uses Gemini/Vertex AI for intelligent optimization (required)
- 💰 **Cost Estimation** - Calculates potential cost savings
- 🔍 **Issue Detection** - Identifies common performance issues
- 📊 **Local Data Storage** - Uses IndexedDB for offline capability
- 🔐 **Simple Authentication** - Hardcoded auth (upgradeable to Google OAuth)
- ⚠️ **No Mock Mode** - Requires working Vertex AI connection

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

## Prerequisites

- Node.js 18+
- Python 3.11+
- Google Cloud Project with APIs enabled:
  - BigQuery API
  - Vertex AI API
  - Cloud Resource Manager API
- Application Default Credentials configured

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository>
cd bigquery-optimizer
```

### 2. Configure Google Cloud

```bash
# Set up Application Default Credentials
gcloud auth application-default login
gcloud config set project your-project-id

# Enable required APIs (if not already enabled)
gcloud services enable aiplatform.googleapis.com
gcloud services enable bigquery.googleapis.com
```

### 3. Local Environment Setup

#### Important: Python 3.11+ Required

This project requires Python 3.11 or higher. Check your Python version:

```bash
python3 --version
# If you don't have Python 3.11, install it:
# macOS: brew install python@3.11
# Ubuntu: sudo apt install python3.11
```

#### Set up Virtual Environments

**Agent API Setup:**
```bash
cd ~/workspace/prototype/bigquery-optimizer/agent_api

# Create virtual environment with Python 3.11
python3.11 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

**Backend API Setup:**
```bash
cd ~/workspace/prototype/bigquery-optimizer/backend_api

# Create virtual environment with Python 3.11
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

**Frontend Setup:**
```bash
cd ~/workspace/prototype/bigquery-optimizer/frontend

# Install Node dependencies
npm install
```

### 4. Start All Services Locally

Run each service in a separate terminal window:

#### Terminal 1 - Agent API (Port 8000)
```bash
cd ~/workspace/prototype/bigquery-optimizer/agent_api
source .venv/bin/activate

# IMPORTANT: Run without 'app' parameter - ADK will auto-discover the app folder
adk api_server --port 8000 --allow_origins="*"
```

#### Terminal 2 - Backend API (Port 8001)
```bash
cd ~/workspace/prototype/bigquery-optimizer/backend_api
source venv/bin/activate
python main_firestore.py
```

#### Terminal 3 - Frontend (Port 3000)
```bash
cd ~/workspace/prototype/bigquery-optimizer/frontend
export VITE_API_URL="http://localhost:8000"
export VITE_BACKEND_API_URL="http://localhost:8001"
npm run dev
```

#### Alternative: Use Deploy Script
```bash
# From project root - runs all services at once
./deploy.sh local
# Press Ctrl+C to stop all services
```

### 5. Access the Application

- **Frontend**: http://localhost:3000 or http://localhost:5173
- **Backend API**: http://localhost:8000/docs
- **ADK UI**: http://localhost:8000/app/
- **BQ API**: http://localhost:8001/docs

**Login Credentials:**
- Username: `admin`
- Password: `bigquery123`

## Environment Configuration

### Setting Up Environment Variables

1. **Copy the example environment file:**
```bash
cp .env.example .env
```

2. **Update the `.env` file with your project details:**
```bash
# Primary configuration
export GCP_PROJECT_ID="your-project-id"
export BQ_PROJECT_ID="${GCP_PROJECT_ID}"  # Can be different from GCP project
export BQ_DATASET="bq_optimizer"
export REGION="us-central1"
```

3. **Source the environment before deployment:**
```bash
source .env
```

## Deployment

### Local Development

```bash
# Start all services locally (runs in background)
./deploy.sh local

# Start individual services (runs in foreground with logs)
./deploy.sh local-agent-api      # Agent API only (port 8000)
./deploy.sh local-backend-api    # Backend API only (port 8001)  
./deploy.sh local-frontend       # Frontend only (port 3000)
```

### Cloud Run Deployment

```bash
# Deploy all services to Cloud Run
./deploy.sh remote

# Deploy individual services
./deploy.sh remote-agent-api     # Deploy Agent API only
./deploy.sh remote-backend-api   # Deploy Backend API only
./deploy.sh remote-frontend      # Deploy Frontend only

# Check deployment status
./deploy.sh status

# Destroy all Cloud Run services
./deploy.sh destroy
```

### Deployment to Different Projects

```bash
# Option 1: Export environment variables
export GCP_PROJECT_ID="my-project-id"
export BQ_DATASET="my_dataset"
./deploy.sh remote

# Option 2: Inline environment variables
GCP_PROJECT_ID="my-project-id" ./deploy.sh remote

# Option 3: Use environment file
source .env.production
./deploy.sh remote
```

## Required Permissions

### Google Cloud IAM Permissions

Each service requires specific permissions to function properly. Create a service account with the following roles:

#### 1. Agent API (ADK Service) Permissions

**Required Roles:**
- `roles/aiplatform.user` - Use Vertex AI models
- `roles/bigquery.dataViewer` - Read BigQuery metadata
- `roles/bigquery.jobUser` - Run BigQuery dry runs and queries
- `roles/bigquery.dataEditor` - Write to bq_optimizer tables

**Specific Permissions:**
```
aiplatform.endpoints.predict
bigquery.datasets.get
bigquery.tables.get
bigquery.tables.list
bigquery.tables.getData
bigquery.tables.create
bigquery.tables.updateData
bigquery.jobs.create
```

#### 2. Backend API Permissions

**Required Roles:**
- `roles/bigquery.admin` - Full BigQuery access for optimization operations
- `roles/logging.logWriter` - Write application logs

**Specific Permissions:**
```
bigquery.datasets.create
bigquery.datasets.get
bigquery.datasets.update
bigquery.tables.*
bigquery.jobs.*
bigquery.routines.list
bigquery.routines.get
resourcemanager.projects.get
```

#### 3. Frontend Permissions

The frontend runs in the browser and doesn't need GCP permissions directly. It communicates with the backend services using their APIs.

### BigQuery Dataset Permissions

Ensure the `bq_optimizer` dataset exists with proper permissions:

```bash
# Create dataset
bq mk --dataset --location=US ${GCP_PROJECT_ID}:bq_optimizer

# Grant permissions to service account
bq add-iam-policy-binding \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor" \
  ${GCP_PROJECT_ID}:bq_optimizer
```

### Required BigQuery Tables

The following tables will be created automatically:

- `bq_optimizer.query_templates` - Stores query patterns
- `bq_optimizer.projects` - Project configurations
- `bq_optimizer.analyses` - Analysis results
- `bq_optimizer.table_analysis` - Table optimization data
- `bq_optimizer.bq_anti_pattern_rules` - Optimization rules

### API Enablement

Enable these APIs in your Google Cloud project:

```bash
gcloud services enable \
  bigquery.googleapis.com \
  aiplatform.googleapis.com \
  cloudresourcemanager.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com
```

### Service Account Setup

1. **Create a service account:**
```bash
gcloud iam service-accounts create bigquery-optimizer \
  --display-name="BigQuery Optimizer Service Account"
```

2. **Grant necessary roles:**
```bash
# For Agent API
gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:bigquery-optimizer@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:bigquery-optimizer@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:bigquery-optimizer@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

# For Backend API
gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:bigquery-optimizer@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/bigquery.admin"
```

3. **Download service account key (for local development):**
```bash
gcloud iam service-accounts keys create service-account.json \
  --iam-account=bigquery-optimizer@${GCP_PROJECT_ID}.iam.gserviceaccount.com

# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/service-account.json"
```

### Cloud Run Service Account

When deploying to Cloud Run, the services use the default Compute Engine service account. Grant it necessary permissions:

```bash
# Get the default service account
PROJECT_NUMBER=$(gcloud projects describe ${GCP_PROJECT_ID} --format='value(projectNumber)')
DEFAULT_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant permissions
gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:${DEFAULT_SA}" \
  --role="roles/bigquery.admin"

gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:${DEFAULT_SA}" \
  --role="roles/aiplatform.user"
```

### CORS Configuration

For production deployments, update CORS settings:

```bash
# In .env or deployment script
export CORS_ORIGINS="https://your-frontend-domain.com,https://backup-domain.com"
```

### Production URLs (Example)

After deployment, your services will be available at:

- **Frontend**: `https://bigquery-optimizer-frontend-xxxxx-uc.a.run.app`
- **Agent API**: `https://bigquery-optimizer-agent-api-xxxxx-uc.a.run.app`
- **Backend API**: `https://bigquery-optimizer-backend-api-xxxxx-uc.a.run.app`
- **ADK UI**: `https://bigquery-optimizer-agent-api-xxxxx-uc.a.run.app/app/`

## Manual Setup

### Backend Setup

```bash
cd backend

# Install uv package manager
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env with your project details

# Run ADK server
uv run adk api_server app --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## Testing

### Test BigQuery Connection

```bash
# List datasets
bq ls

# Test query
bq query --use_legacy_sql=false 'SELECT 1 as test'
```

### Test with Sample Queries

Try these queries in the app:

```sql
-- Simple query with issues
SELECT * FROM analytics.events

-- Public dataset query
SELECT * 
FROM `bigquery-public-data.samples.shakespeare` 
WHERE word_count > 100

-- Complex query for optimization
SELECT 
  user_id,
  COUNT(*) as event_count,
  MAX(timestamp) as last_seen
FROM analytics.events
GROUP BY user_id
ORDER BY event_count DESC
```

## Project Structure

```
bigquery-optimizer/
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── pages/           # Main app pages
│   │   ├── components/      # Reusable components
│   │   ├── services/        # API and data services
│   │   │   ├── database.js  # IndexedDB with Dexie
│   │   │   └── adk.js       # ADK backend integration
│   │   └── contexts/        # React contexts
│   └── package.json
│
├── backend/                  # ADK backend
│   ├── app/
│   │   ├── agent.py         # Main optimization agent
│   │   ├── config.py        # Configuration
│   │   └── tools/           # BigQuery tools
│   ├── pyproject.toml       # Python dependencies
│   └── .env                 # Environment config
│
└── start.sh                 # Startup script
```

## Configuration

### Backend (.env)

```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_GENAI_USE_VERTEXAI=True
BIGQUERY_DATASET=analytics
BIGQUERY_LOCATION=US
ADK_PORT=8000
```

### Frontend

The frontend automatically connects to:
- Backend at `http://localhost:8000`
- Shows clear error messages if backend or Vertex AI is unavailable

## Features in Detail

### Query Optimization

The optimizer checks for:
- SELECT * usage (recommends specific columns)
- Missing partition filters
- Inefficient JOINs
- Missing LIMIT with ORDER BY
- Subqueries that could be CTEs
- Non-sargable WHERE clauses

### Cost Estimation

- Uses BigQuery dry-run API for accurate cost estimates
- Calculates bytes processed and estimated costs
- Shows percentage savings between original and optimized queries

### Local Storage

- All analyses saved to IndexedDB
- Works offline with cached data
- Automatic sync when online

## Development

### Adding New Optimization Rules

Edit `backend/app/agent.py` and add rules to the optimization prompt:

```python
# Add new optimization checks in the prompt
"9. Your new optimization rule here"
```

### Customizing Frontend

- Edit components in `frontend/src/pages/`
- Modify theme in `frontend/src/index.css`
- Add new routes in `frontend/src/App.jsx`

## Troubleshooting

### Common Setup Issues

#### Dependency Conflicts
If you encounter dependency conflicts during installation:

```bash
# Clean install in virtual environment
rm -rf .venv venv
python3.11 -m venv .venv  # or venv for backend_api
source .venv/bin/activate  # or venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

#### Virtual Environment Not Activated
Always verify you're in the virtual environment before installing packages:

```bash
# Check if virtual environment is active
which python
# Should show: /path/to/your/project/.venv/bin/python

# If not, activate it:
source .venv/bin/activate  # or venv/bin/activate for backend_api
```

#### Port Already in Use
If ports are already in use:

```bash
# Kill services on specific ports
lsof -ti:8000,8001,3000 | xargs kill -9 2>/dev/null
```

### Backend won't start

```bash
# Check if ADC is configured
gcloud auth application-default login

# Verify project
gcloud config get-value project
```

### "Vertex AI not available" error

This is a critical error - the system requires Vertex AI to function.

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Verify it's enabled
gcloud services list --enabled | grep aiplatform

# Check if you have proper permissions
gcloud projects get-iam-policy $(gcloud config get-value project)
```

**Note:** There is no fallback mode. Vertex AI must be configured and working.

### BigQuery connection issues

```bash
# Test BigQuery access
bq ls

# Check permissions
gcloud projects get-iam-policy your-project-id
```

## Production Deployment

### Backend (Cloud Run)

```bash
# Build and deploy
gcloud run deploy bigquery-optimizer-backend \
  --source backend \
  --port 8000 \
  --region us-central1 \
  --allow-unauthenticated
```

### Frontend (Firebase Hosting)

```bash
cd frontend
npm run build
firebase deploy --only hosting
```

## Roadmap

- [ ] Google OAuth integration
- [ ] Real-time collaboration
- [ ] Query history and versioning
- [ ] Custom optimization rules UI
- [ ] Export optimization reports
- [ ] Scheduled query analysis
- [ ] Team workspaces

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/your-repo/issues)
- Documentation: [ADK Documentation](https://cloud.google.com/agent-development-kit/docs)

## Credits

Built with:
- [Google ADK](https://cloud.google.com/agent-development-kit)
- [Vertex AI](https://cloud.google.com/vertex-ai)
- [BigQuery](https://cloud.google.com/bigquery)
- [React](https://react.dev)
- [Vite](https://vitejs.dev)