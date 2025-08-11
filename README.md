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
│         Project: aiva-e74f3             │
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
gcloud config set project aiva-e74f3

# Enable required APIs (if not already enabled)
gcloud services enable aiplatform.googleapis.com
gcloud services enable bigquery.googleapis.com
```

### 3. Start All Services Locally

#### Option 1: Run all services with single command (Recommended)

```bash
# Run the deployment script for local development
./deploy.sh local
```

This will automatically:
1. Start the ADK backend on port 8000
2. Start the BQ API service on port 8001
3. Start the React frontend on port 3000/5173
4. Enable CORS for local development

#### Option 2: Run services individually (for debugging)

```bash
# Terminal 1 - Backend ADK Service
cd backend && source .venv/bin/activate && adk api_server app --port 8000

# Terminal 2 - BQ API Service
cd bq-api && python main_firestore.py

# Terminal 3 - Frontend
cd frontend && npm run dev
```

### 4. Access the Application

- **Frontend**: http://localhost:3000 or http://localhost:5173
- **Backend API**: http://localhost:8000/docs
- **ADK UI**: http://localhost:8000/app/
- **BQ API**: http://localhost:8001/docs

**Login Credentials:**
- Username: `admin`
- Password: `bigquery123`

## Deployment

### Deploy to Cloud Run

```bash
# Deploy both frontend and backend
./deploy.sh deploy

# Check deployment status
./deploy.sh status

# Deploy only backend
./deploy.sh deploy-backend

# Deploy only frontend
./deploy.sh deploy-frontend

# Destroy all services
./deploy.sh destroy
```

### Current Production URLs

- **Frontend**: https://bigquery-optimizer-frontend-puql6kbaxq-uc.a.run.app
- **Backend**: https://bigquery-optimizer-backend-puql6kbaxq-uc.a.run.app
- **ADK UI**: https://bigquery-optimizer-backend-puql6kbaxq-uc.a.run.app/app/

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
GOOGLE_CLOUD_PROJECT=aiva-e74f3
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
gcloud projects get-iam-policy aiva-e74f3
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