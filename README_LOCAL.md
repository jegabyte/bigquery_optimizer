# Running BigQuery Optimizer Locally

## Complete Setup - All 3 Services

Run each service in a separate terminal:

### Terminal 1 - Agent API (ADK) (Port 8000)
```bash
cd ~/workspace/prototype/bigquery-optimizer/agent_api
source .venv/bin/activate
# IMPORTANT: Run without 'app' parameter - ADK will auto-discover the app folder
adk api_server --port 8000 --allow_origins="*"
```
- API Docs: http://localhost:8000/docs
- Note: Root URL (/) will show "Not Found" - this is normal

### Terminal 2 - Backend API (Port 8001)
```bash
cd ~/workspace/prototype/bigquery-optimizer/agent_api_api
source .venv/bin/activate
python main.py
```
- API Docs: http://localhost:8001/docs
- Health Check: http://localhost:8001/health

### Terminal 3 - Frontend (Port 3000)
```bash
cd ~/workspace/prototype/bigquery-optimizer/frontend
export VITE_API_URL="http://localhost:8000"
export VITE_BACKEND_API_URL="http://localhost:8001"
npm run dev
```
- Application: http://localhost:3000 (or http://localhost:5173 - check terminal output)

## Optional: ADK Web UI (Playground)

To test agents interactively, run in a separate terminal:
```bash
cd ~/workspace/prototype/bigquery-optimizer/agent_api
source .venv/bin/activate
# Run without 'app' parameter - ADK will auto-discover
adk web --port 8501
```
- Playground UI: http://localhost:8501
- Select "app" from the dropdown in the UI

## Managing Services

### Kill all services if needed:
```bash
lsof -ti:8000,8001,3000 | xargs kill -9 2>/dev/null
```

### Kill individual services:
```bash
# Kill Agent API
lsof -ti:8000 | xargs kill -9 2>/dev/null

# Kill Backend API
lsof -ti:8001 | xargs kill -9 2>/dev/null

# Kill Frontend
lsof -ti:3000 | xargs kill -9 2>/dev/null
```

## Quick Start Script

You can also use the deploy script for all services:
```bash
cd ~/workspace/prototype/bigquery-optimizer
./deploy.sh local
```

Press `Ctrl+C` to stop all services when using the deploy script.

## Troubleshooting

### If virtual environment is missing:
```bash
# For Agent API
cd ~/workspace/prototype/bigquery-optimizer/agent_api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# For Backend API
cd ~/workspace/prototype/bigquery-optimizer/backend_api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### If npm packages are missing:
```bash
cd ~/workspace/prototype/bigquery-optimizer/frontend
npm install
```

## Service URLs Summary

- **Frontend**: http://localhost:3000
- **Agent API (ADK)**: http://localhost:8000/docs
- **Backend API**: http://localhost:8001/docs
- **ADK Playground** (optional): http://localhost:8501