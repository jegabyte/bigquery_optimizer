#!/bin/bash

# ================================================================
# BigQuery Optimizer - Deployment & Management Script
# ================================================================
# Usage:
#   ./deploy.sh              # Show help
#   ./deploy.sh remote       # Deploy all services to Cloud Run
#   ./deploy.sh local        # Start local development
#   ./deploy.sh destroy      # Destroy all services
#   ./deploy.sh status       # Check deployment status
#
# Backend Selection:
#   ./deploy.sh remote --backend=firestore   # Deploy with Firestore backend
#   ./deploy.sh remote --backend=bigquery    # Deploy with BigQuery backend (default)
#   ./deploy.sh local --backend=firestore    # Run locally with Firestore
# ================================================================

set -e

# Get the directory of this script and ensure we're in the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# ================================================================
# Load environment variables from .env file if it exists
# ================================================================
if [ -f ".env" ]; then
    echo "Loading environment from .env file..."
    source .env
fi

# ================================================================
# CENTRALIZED CONFIGURATION - ALL ENVIRONMENT VARIABLES
# ================================================================
# These can be overridden by .env file or environment variables
# ================================================================

# Primary Google Cloud Configuration
export GCP_PROJECT_ID="${GCP_PROJECT_ID}"  # Your GCP project ID - MUST BE SET
export REGION="${REGION:-us-central1}"                  # Deployment region

# BigQuery Configuration
export BQ_PROJECT_ID="${BQ_PROJECT_ID:-$GCP_PROJECT_ID}"  # BigQuery project (defaults to GCP project)
export BQ_DATASET="${BQ_DATASET:-bq_optimizer}"           # BigQuery dataset name
export BQ_LOCATION="${BQ_LOCATION:-US}"                   # BigQuery dataset location

# Service Names (for Cloud Run)
AGENT_API_SERVICE="bigquery-optimizer-agent-api"
FRONTEND_SERVICE="bigquery-optimizer-frontend"
BACKEND_API_SERVICE="bigquery-optimizer-backend-api"

# Application Configuration
export APP_ENV="${APP_ENV:-production}"                   # Environment: development, staging, production
export DEBUG="${DEBUG:-false}"                            # Debug mode

# API Ports (for local development)
export AGENT_API_PORT="${AGENT_API_PORT:-8000}"
export BACKEND_API_PORT="${BACKEND_API_PORT:-8001}"
export FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# CORS Configuration
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000,http://localhost:5173}"

# Backend Configuration (bigquery or firestore)
export BACKEND_TYPE="${BACKEND_TYPE:-bigquery}"  # Default to BigQuery backend

# Parse command line arguments
# Look for --backend or --db flags anywhere in the arguments
for i in "$@"; do
    case $i in
        --backend=*|--db=*)
            BACKEND_TYPE="${i#*=}"
            ;;
    esac
done

# Validate backend type
if [[ "$BACKEND_TYPE" != "bigquery" && "$BACKEND_TYPE" != "firestore" ]]; then
    echo "ERROR: Invalid backend type: $BACKEND_TYPE"
    echo "Valid options are: bigquery, firestore"
    exit 1
fi

# Set the main file based on backend type
if [ "$BACKEND_TYPE" = "firestore" ]; then
    BACKEND_MAIN_FILE="main_firestore.py"
    echo "Using Firestore backend"
else
    BACKEND_MAIN_FILE="main.py"
    echo "Using BigQuery backend"
fi

export BACKEND_MAIN_FILE

# Validate required environment variables
if [ -z "$GCP_PROJECT_ID" ]; then
    echo "ERROR: GCP_PROJECT_ID is not set!"
    echo "Please set it using one of these methods:"
    echo "  1. Export: export GCP_PROJECT_ID=your-project-id"
    echo "  2. Inline: GCP_PROJECT_ID=your-project-id ./deploy.sh"
    echo "  3. Create .env file with: GCP_PROJECT_ID=your-project-id"
    exit 1
fi

# Set consistent PROJECT_ID for backward compatibility
PROJECT_ID="$GCP_PROJECT_ID"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Deploy Agent API Function
deploy_agent_api() {
    print_header "Deploying Agent API Service with ADK"
    
    # Store current directory
    CURRENT_DIR=$(pwd)
    
    # Change to agent_api directory
    cd agent_api
    
    # Check for virtual environment and activate it
    print_info "Checking for virtual environment..."
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    else
        print_error "Virtual environment not found. Please run 'python -m venv .venv' in agent_api directory"
        exit 1
    fi
    
    print_info "Deploying ADK service from agent_api directory..."
    print_info "Project: $PROJECT_ID"
    print_info "Region: $REGION"
    print_info "Service: $AGENT_API_SERVICE"
    
    # ADK deployment command based on documentation
    # When run from within agent_api folder, we use app as the agent path
    # No app_name parameter since root_agent is at the root level
    adk deploy cloud_run \
        --project=$PROJECT_ID \
        --region=$REGION \
        --service_name=$AGENT_API_SERVICE \
        --allow_origins="*" \
        --with_ui \
        app
    
    # Check if deployment was successful
    if [ $? -eq 0 ]; then
        # Set environment variables after successful deployment
        print_info "Setting environment variables for Agent API..."
        gcloud run services update $AGENT_API_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --set-env-vars="GCP_PROJECT_ID=$GCP_PROJECT_ID,BQ_PROJECT_ID=$BQ_PROJECT_ID,BQ_DATASET=$BQ_DATASET,BQ_LOCATION=$BQ_LOCATION,APP_ENV=$APP_ENV,BACKEND_API_URL=https://${BACKEND_API_SERVICE}-${REGION}.a.run.app"
        
        # Get the service URL
        AGENT_API_URL=$(gcloud run services describe $AGENT_API_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --format='value(status.url)')
        
        print_success "Agent API deployed at: $AGENT_API_URL"
        print_info "ADK UI available at: $AGENT_API_URL/app/"
        print_info "API Docs available at: $AGENT_API_URL/docs"
    else
        print_error "ADK deployment failed"
        exit 1
    fi
    
    # Return to original directory
    cd $CURRENT_DIR
}

# Deploy Backend API Function (with Firestore agent_api)
deploy_backend_api() {
    print_header "Deploying BigQuery API Service (Firestore Agent API)"
    
    cd backend_api
    
    print_info "Building and deploying Backend API with Firestore integration..."
    print_info "This service uses Firestore database for storing projects, templates, and analyses"
    
    # Deploy directly using Cloud Build (more reliable than local Docker)
    gcloud run deploy ${BACKEND_API_SERVICE} \
        --source . \
        --platform managed \
        --region ${REGION} \
        --allow-unauthenticated \
        --set-env-vars GCP_PROJECT_ID=${GCP_PROJECT_ID},BQ_PROJECT_ID=${BQ_PROJECT_ID},BQ_DATASET=${BQ_DATASET},BQ_LOCATION=${BQ_LOCATION},APP_ENV=${APP_ENV},GOOGLE_CLOUD_PROJECT=${GCP_PROJECT_ID},BACKEND_TYPE=${BACKEND_TYPE},BACKEND_MAIN_FILE=${BACKEND_MAIN_FILE} \
        --memory 512Mi \
        --timeout 60 \
        --max-instances 10 \
        --port 8001
    
    BACKEND_API_URL=$(gcloud run services describe $BACKEND_API_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)')
    
    print_success "Backend API deployed at: $BACKEND_API_URL"
    
    # Return to root directory
    cd ..
}

# Deploy Frontend Function
deploy_frontend() {
    print_header "Deploying Frontend Service"
    
    cd frontend
    
    # Get agent_api URL
    AGENT_API_URL=$(gcloud run services describe $AGENT_API_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -z "$AGENT_API_URL" ]; then
        print_error "Agent API service not found. Deploy agent_api first!"
        exit 1
    fi
    
    # Get Backend API URL
    BACKEND_API_URL=$(gcloud run services describe $BACKEND_API_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -z "$BACKEND_API_URL" ]; then
        print_warning "Backend API service not found. Frontend will use mock data."
    fi
    
    print_info "Agent API URL: $AGENT_API_URL"
    print_info "Backend API URL: $BACKEND_API_URL"
    print_info "Building and deploying frontend..."
    
    # Update Dockerfile with correct agent_api URLs
    sed -i.bak "s|ENV VITE_API_URL=.*|ENV VITE_API_URL=$AGENT_API_URL|" Dockerfile
    sed -i.bak "s|ENV VITE_BACKEND_API_URL=.*|ENV VITE_BACKEND_API_URL=$BACKEND_API_URL|" Dockerfile
    rm -f Dockerfile.bak
    
    gcloud run deploy $FRONTEND_SERVICE \
        --source . \
        --region=$REGION \
        --allow-unauthenticated \
        --port=8080 \
        --memory=256Mi \
        --project=$PROJECT_ID \
        --set-env-vars="VITE_API_URL=$AGENT_API_URL,VITE_BACKEND_API_URL=$BACKEND_API_URL,VITE_GCP_PROJECT_ID=$GCP_PROJECT_ID,VITE_BQ_DATASET=$BQ_DATASET,VITE_APP_ENV=$APP_ENV" \
        --quiet
    
    FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)')
    
    print_success "Frontend deployed at: $FRONTEND_URL"
    cd ..
}

# Destroy Services Function
destroy_services() {
    print_header "Destroying Services"
    
    print_warning "This will delete both frontend and agent_api services."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deleting frontend service..."
        gcloud run services delete $FRONTEND_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --quiet 2>/dev/null || print_warning "Frontend service not found"
        
        print_info "Deleting agent_api service..."
        gcloud run services delete $AGENT_API_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --quiet 2>/dev/null || print_warning "Agent API service not found"
        
        print_info "Deleting Backend API service..."
        gcloud run services delete $BACKEND_API_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --quiet 2>/dev/null || print_warning "Backend API service not found"
        
        print_success "Services destroyed"
    else
        print_info "Destruction cancelled"
    fi
}

# Start Local Development
start_local() {
    print_header "Starting Local Development Servers"
    
    # Kill existing processes on all required ports
    print_info "Checking for existing processes..."
    
    # Kill processes on all service ports
    kill_port $AGENT_API_PORT "Agent API"
    kill_port $BACKEND_API_PORT "Backend API"
    kill_port $FRONTEND_PORT "Frontend"
    
    # Kill any vite processes
    VITE_PIDS=$(ps aux | grep "vite" | grep -v grep | awk '{print $2}')
    if [ -n "$VITE_PIDS" ]; then
        print_warning "Killing existing vite processes"
        echo $VITE_PIDS | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # Kill any uvicorn processes (Backend API)
    UVICORN_PIDS=$(ps aux | grep "uvicorn" | grep -v grep | awk '{print $2}')
    if [ -n "$UVICORN_PIDS" ]; then
        print_warning "Killing existing uvicorn processes"
        echo $UVICORN_PIDS | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # Start Agent API AI (ADK)
    print_info "Starting agent_api AI server (ADK)..."
    cd agent_api
    
    # Check for Python version for agent_api
    AGENT_API_PYTHON_CMD=""
    if command -v python3.12 &> /dev/null; then
        AGENT_API_PYTHON_CMD="python3.12"
        print_info "Using Python 3.12 for Agent API AI"
    elif command -v python3.11 &> /dev/null; then
        AGENT_API_PYTHON_CMD="python3.11"
        print_info "Using Python 3.11 for Agent API AI"
    elif command -v python3.10 &> /dev/null; then
        AGENT_API_PYTHON_CMD="python3.10"
        print_info "Using Python 3.10 for Agent API AI"
    else
        AGENT_API_PYTHON_CMD="python3"
        print_info "Using default Python 3 for Agent API AI"
    fi
    
    # Check if virtual environment exists and is valid
    if [ -d ".venv" ] && [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
        # Check if ADK is installed
        if ! command -v adk &> /dev/null && ! [ -f ".venv/bin/adk" ]; then
            print_warning "ADK not found in virtual environment. Installing..."
            pip install --upgrade pip
            pip install -r requirements.txt
        fi
    else
        # Create new virtual environment
        print_warning "Agent API virtual environment not found. Creating it..."
        $AGENT_API_PYTHON_CMD -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
    
    # Set environment variables for agent API
    export GCP_PROJECT_ID=$GCP_PROJECT_ID
    export BQ_PROJECT_ID=$BQ_PROJECT_ID
    export BQ_DATASET=$BQ_DATASET
    export APP_ENV=${APP_ENV:-development}
    export BACKEND_API_URL="http://localhost:$BACKEND_API_PORT"
    
    # Start the agent_api server (no app parameter needed)
    # It will fetch rules from Backend API instead of direct DB access
    adk api_server --port $AGENT_API_PORT --allow_origins="*" &
    AGENT_API_PID=$!
    print_success "Agent API AI started on http://localhost:$AGENT_API_PORT (PID: $AGENT_API_PID)"
    print_info "  - AI Interface: http://localhost:$AGENT_API_PORT/app/"
    print_info "  - API Docs: http://localhost:$AGENT_API_PORT/docs"
    
    cd ..
    
    # Start Backend API
    print_info "Starting BigQuery API server..."
    cd backend_api
    
    # Check for Python 3.12 or 3.11 (avoid 3.13 for pydantic compatibility)
    PYTHON_CMD=""
    if command -v python3.12 &> /dev/null; then
        PYTHON_CMD="python3.12"
        print_info "Using Python 3.12 for Backend API"
    elif command -v python3.11 &> /dev/null; then
        PYTHON_CMD="python3.11"
        print_info "Using Python 3.11 for Backend API"
    elif command -v python3.10 &> /dev/null; then
        PYTHON_CMD="python3.10"
        print_info "Using Python 3.10 for Backend API"
    else
        PYTHON_CMD="python3"
        print_warning "Using default Python 3 - may have compatibility issues with Python 3.13"
    fi
    
    # Check if virtual environment exists and is valid
    if [ -d ".venv" ] && [ -f ".venv/bin/activate" ]; then
        # Check if venv was created with compatible Python version
        VENV_PYTHON_VERSION=$(.venv/bin/python --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
        SYSTEM_PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
        
        if [ "$VENV_PYTHON_VERSION" != "$SYSTEM_PYTHON_VERSION" ]; then
            print_warning "Virtual environment Python version ($VENV_PYTHON_VERSION) differs from system ($SYSTEM_PYTHON_VERSION)"
            print_info "Recreating virtual environment with $PYTHON_CMD..."
            rm -rf .venv
            $PYTHON_CMD -m venv .venv
            source .venv/bin/activate
            pip install --upgrade pip
            pip install -r requirements.txt
        else
            source .venv/bin/activate
        fi
    else
        # Create new virtual environment
        print_warning "Backend API virtual environment not found. Creating it..."
        $PYTHON_CMD -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
    
    # Set environment variables for backend API
    export GCP_PROJECT_ID=$GCP_PROJECT_ID
    export BQ_PROJECT_ID=$BQ_PROJECT_ID
    export BQ_DATASET=$BQ_DATASET
    export BQ_LOCATION=$BQ_LOCATION
    export APP_ENV=${APP_ENV:-development}
    
    # Start the Backend API server with selected backend
    if [ "$BACKEND_TYPE" = "firestore" ]; then
        print_info "Starting Backend API with Firestore backend..."
        python main_firestore.py &
    else
        print_info "Starting Backend API with BigQuery backend..."
        python main.py &
    fi
    BACKEND_API_PID=$!
    print_success "Backend API started on http://localhost:$BACKEND_API_PORT (PID: $BACKEND_API_PID)"
    print_info "  - API Docs: http://localhost:$BACKEND_API_PORT/docs"
    print_info "  - Backend Type: $BACKEND_TYPE"
    
    cd ..
    
    # Set environment variables for frontend
    export VITE_API_URL="http://localhost:$AGENT_API_PORT"
    export VITE_BACKEND_API_URL="http://localhost:$BACKEND_API_PORT"
    export VITE_GCP_PROJECT_ID=$GCP_PROJECT_ID
    export VITE_BQ_DATASET=$BQ_DATASET
    export VITE_APP_ENV=${APP_ENV:-development}
    
    # Start Frontend
    print_info "Starting frontend server..."
    cd frontend
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "Node modules not found. Installing dependencies..."
        npm install
    fi
    npm run dev &
    FRONTEND_PID=$!
    print_success "Frontend starting on http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)"
    cd ..
    
    echo ""
    print_success "All services started successfully!"
    echo ""
    print_info "Service URLs:"
    print_info "  Frontend:     http://localhost:$FRONTEND_PORT"
    print_info "  Agent API:    http://localhost:$AGENT_API_PORT (ADK UI: http://localhost:$AGENT_API_PORT/app/)"
    print_info "  Backend API:  http://localhost:$BACKEND_API_PORT (Docs: http://localhost:$BACKEND_API_PORT/docs)"
    echo ""
    print_info "Press Ctrl+C to stop all services"
    
    # Wait for interrupt and kill all services
    trap "print_warning 'Stopping all services...'; kill $AGENT_API_PID $BACKEND_API_PID $FRONTEND_PID 2>/dev/null; exit" INT
    wait
}

# Kill process on specific port
kill_port() {
    local PORT=$1
    local SERVICE_NAME=$2
    
    # Check if something is running on the port
    local PID=$(lsof -ti:$PORT 2>/dev/null || true)
    if [ -n "$PID" ]; then
        print_warning "Killing existing $SERVICE_NAME process on port $PORT (PID: $PID)"
        kill -9 $PID 2>/dev/null || true
        sleep 1
    fi
}

# Start Agent API Only (Local)
start_agent_api_local() {
    print_header "Starting Agent API Server (Local - Foreground)"
    
    # Kill existing process on port 8000
    kill_port $AGENT_API_PORT "Agent API"
    
    cd agent_api
    
    # Check for Python version
    PYTHON_CMD=""
    if command -v python3.12 &> /dev/null; then
        PYTHON_CMD="python3.12"
    elif command -v python3.11 &> /dev/null; then
        PYTHON_CMD="python3.11"
    elif command -v python3.10 &> /dev/null; then
        PYTHON_CMD="python3.10"
    else
        PYTHON_CMD="python3"
    fi
    
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    else
        print_warning "Virtual environment not found. Creating..."
        $PYTHON_CMD -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
    
    print_success "Starting Agent API server on port $AGENT_API_PORT"
    print_info "URL: http://localhost:$AGENT_API_PORT"
    print_info "ADK UI: http://localhost:$AGENT_API_PORT/app/"
    print_info "API Docs: http://localhost:$AGENT_API_PORT/docs"
    print_info "Press Ctrl+C to stop"
    echo ""
    
    # Set Backend API URL for agent to fetch rules from
    export BACKEND_API_URL="http://localhost:$BACKEND_API_PORT"
    
    # Run in foreground with logs visible (no app parameter needed)
    adk api_server --port $AGENT_API_PORT --allow_origins="*"
}

# Start Backend API Only (Local)
start_backend_api_local() {
    print_header "Starting Backend API Server (Local - Foreground)"
    
    # Kill existing process on port 8001
    kill_port $BACKEND_API_PORT "Backend API"
    
    cd backend_api
    
    # Check for Python version
    PYTHON_CMD=""
    if command -v python3.12 &> /dev/null; then
        PYTHON_CMD="python3.12"
    elif command -v python3.11 &> /dev/null; then
        PYTHON_CMD="python3.11"
    elif command -v python3.10 &> /dev/null; then
        PYTHON_CMD="python3.10"
    else
        PYTHON_CMD="python3"
    fi
    
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    else
        print_warning "Virtual environment not found. Creating..."
        $PYTHON_CMD -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
    
    print_success "Starting Backend API server on port $BACKEND_API_PORT"
    print_info "URL: http://localhost:$BACKEND_API_PORT"
    print_info "API Docs: http://localhost:$BACKEND_API_PORT/docs"
    print_info "Press Ctrl+C to stop"
    echo ""
    
    # Set environment variables for backend
    export GCP_PROJECT_ID=$GCP_PROJECT_ID
    export BQ_PROJECT_ID=$BQ_PROJECT_ID
    export BQ_DATASET=$BQ_DATASET
    export BQ_LOCATION=$BQ_LOCATION
    export APP_ENV=$APP_ENV
    
    # Run in foreground with logs visible
    # Use the selected backend (main.py for bigquery, main_firestore.py for firestore)
    if [ "$BACKEND_TYPE" = "firestore" ]; then
        print_info "Starting with Firestore backend (main_firestore.py)..."
        uvicorn main_firestore:app --host 0.0.0.0 --port $BACKEND_API_PORT --reload
    else
        print_info "Starting with BigQuery backend (main.py)..."
        uvicorn main:app --host 0.0.0.0 --port $BACKEND_API_PORT --reload
    fi
}

# Start Frontend Only (Local)
start_frontend_local() {
    print_header "Starting Frontend Server (Local - Foreground)"
    
    # Kill existing process on port 3000
    kill_port $FRONTEND_PORT "Frontend"
    
    # Kill any existing vite processes
    VITE_PIDS=$(ps aux | grep "vite" | grep -v grep | awk '{print $2}')
    if [ -n "$VITE_PIDS" ]; then
        print_warning "Killing existing vite processes"
        echo $VITE_PIDS | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    cd frontend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "Node modules not found. Installing dependencies..."
        npm install
    fi
    
    # Set environment variables for frontend
    export VITE_API_URL="http://localhost:$AGENT_API_PORT"
    export VITE_BACKEND_API_URL="http://localhost:$BACKEND_API_PORT"
    export VITE_GCP_PROJECT_ID=$GCP_PROJECT_ID
    export VITE_BQ_DATASET=$BQ_DATASET
    export VITE_APP_ENV=$APP_ENV
    
    print_success "Starting Frontend server on port $FRONTEND_PORT"
    print_info "URL: http://localhost:$FRONTEND_PORT"
    print_info "Agent API: $VITE_API_URL"
    print_info "Backend API: $VITE_BACKEND_API_URL"
    print_info "Press Ctrl+C to stop"
    echo ""
    
    # Run in foreground with logs visible
    npm run dev
}

# Check Status Function
check_status() {
    print_header "Deployment Status"
    
    echo ""
    echo "Project: $PROJECT_ID"
    echo "Region: $REGION"
    echo ""
    
    # Agent API status
    AGENT_API_URL=$(gcloud run services describe $AGENT_API_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -n "$AGENT_API_URL" ]; then
        print_success "Agent API Service: DEPLOYED"
        echo "  URL: $AGENT_API_URL"
        echo "  ADK UI: $AGENT_API_URL/app/"
        echo "  API Docs: $AGENT_API_URL/docs"
        
        # Get agent_api details
        AGENT_API_DETAILS=$(gcloud run services describe $AGENT_API_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --format='value(status.traffic[0].latestRevision,spec.template.spec.containers[0].resources.limits.memory)' 2>/dev/null)
        echo "  Latest Revision: $(echo $AGENT_API_DETAILS | cut -d' ' -f1)"
        echo "  Memory: $(echo $AGENT_API_DETAILS | cut -d' ' -f2)"
    else
        print_warning "Agent API Service: NOT DEPLOYED"
    fi
    
    echo ""
    
    # Backend API status
    BACKEND_API_URL=$(gcloud run services describe $BACKEND_API_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -n "$BACKEND_API_URL" ]; then
        print_success "Backend API Service: DEPLOYED"
        echo "  URL: $BACKEND_API_URL"
        echo "  API Docs: $BACKEND_API_URL/docs"
        
        # Get Backend API details
        BACKEND_API_DETAILS=$(gcloud run services describe $BACKEND_API_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --format='value(status.traffic[0].latestRevision,spec.template.spec.containers[0].resources.limits.memory)' 2>/dev/null)
        echo "  Latest Revision: $(echo $BACKEND_API_DETAILS | cut -d' ' -f1)"
        echo "  Memory: $(echo $BACKEND_API_DETAILS | cut -d' ' -f2)"
    else
        print_warning "Backend API Service: NOT DEPLOYED"
    fi
    
    echo ""
    
    # Frontend status
    FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -n "$FRONTEND_URL" ]; then
        print_success "Frontend Service: DEPLOYED"
        echo "  URL: $FRONTEND_URL"
        
        # Get frontend details
        FRONTEND_DETAILS=$(gcloud run services describe $FRONTEND_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --format='value(status.traffic[0].latestRevision,spec.template.spec.containers[0].resources.limits.memory)' 2>/dev/null)
        echo "  Latest Revision: $(echo $FRONTEND_DETAILS | cut -d' ' -f1)"
        echo "  Memory: $(echo $FRONTEND_DETAILS | cut -d' ' -f2)"
    else
        print_warning "Frontend Service: NOT DEPLOYED"
    fi
    
    # Test agent_api health
    if [ -n "$AGENT_API_URL" ]; then
        echo ""
        print_info "Testing agent_api health..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AGENT_API_URL/docs" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            print_success "Agent API is healthy (HTTP $HTTP_CODE)"
        elif [ "$HTTP_CODE" = "000" ]; then
            print_error "Agent API is not reachable"
        else
            print_warning "Agent API returned HTTP $HTTP_CODE"
        fi
    fi
}

# Main script
main() {
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if ADK is installed (for agent_api deployment)
    if [[ "${1:-both}" == "agent_api" ]] || [[ "${1:-both}" == "both" ]]; then
        if ! command -v adk &> /dev/null; then
            # Check in venv
            if [ -f "agent_api/.venv/bin/adk" ]; then
                print_info "ADK found in virtual environment"
            else
                print_error "ADK is not installed. Please install with: pip install google-adk"
                exit 1
            fi
        fi
    fi
    
    # Get the first non-flag argument as the command
    ACTION="help"
    for arg in "$@"; do
        case $arg in
            --backend=*|--db=*)
                # Skip flags
                ;;
            *)
                # This is our command
                ACTION="$arg"
                break
                ;;
        esac
    done
    
    case "$ACTION" in
        # Remote deployment commands (Cloud Run)
        remote)
            deploy_agent_api
            echo ""
            deploy_backend_api
            echo ""
            deploy_frontend
            echo ""
            check_status
            ;;
        remote-agent-api)
            deploy_agent_api
            ;;
        remote-backend-api)
            deploy_backend_api
            ;;
        remote-frontend)
            deploy_frontend
            ;;
        
        # Local development commands
        local)
            start_local
            ;;
        local-agent-api)
            start_agent_api_local
            ;;
        local-backend-api)
            start_backend_api_local
            ;;
        local-frontend)
            start_frontend_local
            ;;
        
        # Management commands
        destroy)
            destroy_services
            ;;
        status)
            check_status
            ;;
        
        # Help
        help|--help|-h|*)
            echo "BigQuery Optimizer - Management Script"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "REMOTE DEPLOYMENT (Cloud Run):"
            echo "  remote                - Deploy all services to Cloud Run"
            echo "  remote-agent-api      - Deploy only Agent API to Cloud Run"
            echo "  remote-backend-api    - Deploy only Backend API to Cloud Run"
            echo "  remote-frontend       - Deploy only Frontend to Cloud Run"
            echo ""
            echo "LOCAL DEVELOPMENT:"
            echo "  local                 - Start all services locally (background)"
            echo "  local-agent-api       - Start only Agent API locally (foreground with logs)"
            echo "  local-backend-api     - Start only Backend API locally (foreground with logs)"
            echo "  local-frontend        - Start only Frontend locally (foreground with logs)"
            echo ""
            echo "MANAGEMENT:"
            echo "  status                - Check deployment status"
            echo "  destroy               - Delete all Cloud Run services"
            echo ""
            echo "BACKEND OPTIONS:"
            echo "  --backend=bigquery    - Use BigQuery tables for storage (default)"
            echo "  --backend=firestore   - Use Firestore for storage"
            echo "  --db=bigquery         - Alias for --backend"
            echo "  --db=firestore        - Alias for --backend"
            echo ""
            echo "EXAMPLES:"
            echo "  $0 remote --backend=firestore    # Deploy with Firestore backend"
            echo "  $0 local --db=bigquery           # Run locally with BigQuery backend"
            echo ""
            echo "CURRENT CONFIGURATION:"
            echo "  Project:     $GCP_PROJECT_ID"
            echo "  BQ Dataset:  $BQ_DATASET"
            echo "  Backend:     $BACKEND_TYPE"
            echo "  Region:      $REGION"
            echo "  Environment: $APP_ENV"
            echo ""
            echo "SERVICES:"
            echo "  Agent API:   $AGENT_API_SERVICE"
            echo "  Backend API: $BACKEND_API_SERVICE"
            echo "  Frontend:    $FRONTEND_SERVICE"
            echo ""
            echo "EXAMPLES:"
            echo "  $0 local              # Start all services locally"
            echo "  $0 local-backend-api  # Start only backend API with logs"
            echo "  $0 remote             # Deploy all to Cloud Run"
            echo "  $0 remote-frontend    # Deploy only frontend to Cloud Run"
            echo "  $0 status             # Check deployment status"
            echo "  $0 destroy            # Remove all Cloud Run services"
            exit 0
            ;;
    esac
}

# Run main function
main "$@"