#!/bin/bash

# ================================================================
# BigQuery Optimizer - Local Development Script
# ================================================================
# Usage:
#   ./deploy_local.sh              # Start all services
#   ./deploy_local.sh --backend=firestore   # Start with Firestore backend
#   ./deploy_local.sh --backend=bigquery    # Start with BigQuery backend (default)
#   ./deploy_local.sh agent-api    # Start only Agent API (foreground)
#   ./deploy_local.sh backend-api  # Start only Backend API (foreground)
#   ./deploy_local.sh frontend     # Start only Frontend (foreground)
#   ./deploy_local.sh stop         # Stop all running services
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
# CONFIGURATION
# ================================================================

# Primary Google Cloud Configuration
export GCP_PROJECT_ID="${GCP_PROJECT_ID}"
export REGION="${REGION:-us-central1}"

# BigQuery Configuration
export BQ_PROJECT_ID="${BQ_PROJECT_ID:-$GCP_PROJECT_ID}"
export BQ_DATASET="${BQ_DATASET:-bq_optimizer}"
export BQ_LOCATION="${BQ_LOCATION:-US}"

# Application Configuration
export APP_ENV="${APP_ENV:-development}"
export DEBUG="${DEBUG:-true}"

# API Ports
export AGENT_API_PORT="${AGENT_API_PORT:-8000}"
export BACKEND_API_PORT="${BACKEND_API_PORT:-8001}"
export FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# CORS Configuration
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000,http://localhost:5173}"

# Backend Configuration (bigquery or firestore)
export BACKEND_TYPE="${BACKEND_TYPE:-firestore}"

# Parse command line arguments for backend type
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

# Validate required environment variables
if [ -z "$GCP_PROJECT_ID" ]; then
    echo "ERROR: GCP_PROJECT_ID is not set!"
    echo "Please set it using one of these methods:"
    echo "  1. Export: export GCP_PROJECT_ID=your-project-id"
    echo "  2. Create .env file with: GCP_PROJECT_ID=your-project-id"
    exit 1
fi

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

# Stop all services
stop_all_services() {
    print_header "Stopping All Local Services"
    
    # Kill processes on all service ports
    kill_port $AGENT_API_PORT "Agent API"
    kill_port $BACKEND_API_PORT "Backend API"
    kill_port $FRONTEND_PORT "Frontend"
    
    # Kill any vite processes
    VITE_PIDS=$(ps aux | grep "vite" | grep -v grep | awk '{print $2}' 2>/dev/null || true)
    if [ -n "$VITE_PIDS" ]; then
        print_warning "Killing existing vite processes"
        echo $VITE_PIDS | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # Kill any uvicorn processes
    UVICORN_PIDS=$(ps aux | grep "uvicorn" | grep -v grep | awk '{print $2}' 2>/dev/null || true)
    if [ -n "$UVICORN_PIDS" ]; then
        print_warning "Killing existing uvicorn processes"
        echo $UVICORN_PIDS | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    # Kill any adk processes
    ADK_PIDS=$(ps aux | grep "adk" | grep -v grep | awk '{print $2}' 2>/dev/null || true)
    if [ -n "$ADK_PIDS" ]; then
        print_warning "Killing existing adk processes"
        echo $ADK_PIDS | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    
    print_success "All services stopped"
}

# Setup Python virtual environment
setup_python_venv() {
    local SERVICE_DIR=$1
    local SERVICE_NAME=$2
    
    cd "$SERVICE_DIR"
    
    # Check for best Python version
    PYTHON_CMD=""
    if command -v python3.12 &> /dev/null; then
        PYTHON_CMD="python3.12"
        print_info "Using Python 3.12 for $SERVICE_NAME"
    elif command -v python3.11 &> /dev/null; then
        PYTHON_CMD="python3.11"
        print_info "Using Python 3.11 for $SERVICE_NAME"
    elif command -v python3.10 &> /dev/null; then
        PYTHON_CMD="python3.10"
        print_info "Using Python 3.10 for $SERVICE_NAME"
    else
        PYTHON_CMD="python3"
        print_info "Using default Python 3 for $SERVICE_NAME"
    fi
    
    # Check if virtual environment exists and is valid
    if [ -d ".venv" ] && [ -f ".venv/bin/activate" ]; then
        source .venv/bin/activate
        print_info "$SERVICE_NAME virtual environment activated"
    else
        print_warning "$SERVICE_NAME virtual environment not found. Creating..."
        $PYTHON_CMD -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
        print_success "$SERVICE_NAME dependencies installed"
    fi
    
    cd ..
}

# Start Agent API
start_agent_api() {
    local RUN_MODE=${1:-background}  # background or foreground
    
    print_info "Starting Agent API Server..."
    
    # Kill existing process
    kill_port $AGENT_API_PORT "Agent API"
    
    # Setup virtual environment
    setup_python_venv "agent_api" "Agent API"
    
    cd agent_api
    source .venv/bin/activate
    
    # Set environment variables
    export GCP_PROJECT_ID=$GCP_PROJECT_ID
    export BQ_PROJECT_ID=$BQ_PROJECT_ID
    export BQ_DATASET=$BQ_DATASET
    export APP_ENV=$APP_ENV
    export BACKEND_API_URL="http://localhost:$BACKEND_API_PORT"
    
    if [ "$RUN_MODE" = "foreground" ]; then
        print_success "Starting Agent API on http://localhost:$AGENT_API_PORT (foreground mode)"
        print_info "  - AI Interface: http://localhost:$AGENT_API_PORT/app/"
        print_info "  - API Docs: http://localhost:$AGENT_API_PORT/docs"
        print_info "Press Ctrl+C to stop"
        echo ""
        adk api_server --port $AGENT_API_PORT --allow_origins="*"
    else
        adk api_server --port $AGENT_API_PORT --allow_origins="*" &
        AGENT_API_PID=$!
        print_success "Agent API started on http://localhost:$AGENT_API_PORT (PID: $AGENT_API_PID)"
        print_info "  - AI Interface: http://localhost:$AGENT_API_PORT/app/"
        print_info "  - API Docs: http://localhost:$AGENT_API_PORT/docs"
        cd ..
        return $AGENT_API_PID
    fi
}

# Start Backend API
start_backend_api() {
    local RUN_MODE=${1:-background}  # background or foreground
    
    print_info "Starting Backend API Server (Backend: $BACKEND_TYPE)..."
    
    # Kill existing process
    kill_port $BACKEND_API_PORT "Backend API"
    
    # Setup virtual environment
    setup_python_venv "backend_api" "Backend API"
    
    cd backend_api
    source .venv/bin/activate
    
    # Set environment variables
    export GCP_PROJECT_ID=$GCP_PROJECT_ID
    export BQ_PROJECT_ID=$BQ_PROJECT_ID
    export BQ_DATASET=$BQ_DATASET
    export BQ_LOCATION=$BQ_LOCATION
    export APP_ENV=$APP_ENV
    
    if [ "$RUN_MODE" = "foreground" ]; then
        print_success "Starting Backend API on http://localhost:$BACKEND_API_PORT (foreground mode)"
        print_info "  - API Docs: http://localhost:$BACKEND_API_PORT/docs"
        print_info "  - Backend Type: $BACKEND_TYPE"
        print_info "Press Ctrl+C to stop"
        echo ""
        if [ "$BACKEND_TYPE" = "firestore" ]; then
            uvicorn main_firestore:app --host 0.0.0.0 --port $BACKEND_API_PORT --reload
        else
            uvicorn main:app --host 0.0.0.0 --port $BACKEND_API_PORT --reload
        fi
    else
        if [ "$BACKEND_TYPE" = "firestore" ]; then
            python main_firestore.py &
        else
            python main.py &
        fi
        BACKEND_API_PID=$!
        print_success "Backend API started on http://localhost:$BACKEND_API_PORT (PID: $BACKEND_API_PID)"
        print_info "  - API Docs: http://localhost:$BACKEND_API_PORT/docs"
        print_info "  - Backend Type: $BACKEND_TYPE"
        cd ..
        return $BACKEND_API_PID
    fi
}

# Start Frontend
start_frontend() {
    local RUN_MODE=${1:-background}  # background or foreground
    
    print_info "Starting Frontend Server..."
    
    # Kill existing process
    kill_port $FRONTEND_PORT "Frontend"
    
    # Kill any existing vite processes
    VITE_PIDS=$(ps aux | grep "vite" | grep -v grep | awk '{print $2}' 2>/dev/null || true)
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
    
    # Set environment variables
    export VITE_API_URL="http://localhost:$AGENT_API_PORT"
    export VITE_BACKEND_API_URL="http://localhost:$BACKEND_API_PORT"
    export VITE_GCP_PROJECT_ID=$GCP_PROJECT_ID
    export VITE_BQ_DATASET=$BQ_DATASET
    export VITE_APP_ENV=$APP_ENV
    
    if [ "$RUN_MODE" = "foreground" ]; then
        print_success "Starting Frontend on http://localhost:$FRONTEND_PORT (foreground mode)"
        print_info "  - Agent API: $VITE_API_URL"
        print_info "  - Backend API: $VITE_BACKEND_API_URL"
        print_info "Press Ctrl+C to stop"
        echo ""
        npm run dev
    else
        npm run dev &
        FRONTEND_PID=$!
        print_success "Frontend starting on http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)"
        cd ..
        return $FRONTEND_PID
    fi
}

# Start all services
start_all_services() {
    print_header "Starting All Local Development Services"
    print_info "Backend Type: $BACKEND_TYPE"
    echo ""
    
    # Stop any existing services first
    stop_all_services
    echo ""
    
    # Start services in background
    start_agent_api "background"
    AGENT_API_PID=$?
    echo ""
    
    start_backend_api "background"
    BACKEND_API_PID=$?
    echo ""
    
    start_frontend "background"
    FRONTEND_PID=$?
    echo ""
    
    print_success "All services started successfully!"
    echo ""
    print_header "Service URLs"
    print_info "Frontend:     http://localhost:$FRONTEND_PORT"
    print_info "Agent API:    http://localhost:$AGENT_API_PORT"
    print_info "  - AI Chat:  http://localhost:$AGENT_API_PORT/app/"
    print_info "  - API Docs: http://localhost:$AGENT_API_PORT/docs"
    print_info "Backend API:  http://localhost:$BACKEND_API_PORT"
    print_info "  - API Docs: http://localhost:$BACKEND_API_PORT/docs"
    print_info "  - Backend:  $BACKEND_TYPE"
    echo ""
    print_info "Press Ctrl+C to stop all services"
    
    # Wait for interrupt and kill all services
    trap "print_warning 'Stopping all services...'; kill $AGENT_API_PID $BACKEND_API_PID $FRONTEND_PID 2>/dev/null; exit" INT
    wait
}

# Show help
show_help() {
    echo "BigQuery Optimizer - Local Development Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "COMMANDS:"
    echo "  (no command)          Start all services in background"
    echo "  agent-api             Start only Agent API (foreground with logs)"
    echo "  backend-api           Start only Backend API (foreground with logs)"
    echo "  frontend              Start only Frontend (foreground with logs)"
    echo "  stop                  Stop all running services"
    echo "  help                  Show this help message"
    echo ""
    echo "OPTIONS:"
    echo "  --backend=firestore   Use Firestore for storage (default)"
    echo "  --backend=bigquery    Use BigQuery tables for storage"
    echo "  --db=<type>          Alias for --backend"
    echo ""
    echo "EXAMPLES:"
    echo "  $0                           # Start all services with default backend"
    echo "  $0 --backend=firestore       # Start all with Firestore backend"
    echo "  $0 agent-api                 # Start only Agent API with logs"
    echo "  $0 backend-api --db=firestore  # Start Backend API with Firestore"
    echo "  $0 stop                      # Stop all services"
    echo ""
    echo "CURRENT CONFIGURATION:"
    echo "  Project:      $GCP_PROJECT_ID"
    echo "  BQ Dataset:   $BQ_DATASET"
    echo "  Backend:      $BACKEND_TYPE"
    echo "  Environment:  $APP_ENV"
    echo ""
    echo "LOCAL PORTS:"
    echo "  Agent API:    $AGENT_API_PORT"
    echo "  Backend API:  $BACKEND_API_PORT"
    echo "  Frontend:     $FRONTEND_PORT"
}

# Main script
main() {
    # Get the first non-flag argument as the command
    ACTION=""
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
    
    # Default to starting all services if no command given
    if [ -z "$ACTION" ]; then
        ACTION="all"
    fi
    
    case "$ACTION" in
        all)
            start_all_services
            ;;
        agent-api)
            start_agent_api "foreground"
            ;;
        backend-api)
            start_backend_api "foreground"
            ;;
        frontend)
            start_frontend "foreground"
            ;;
        stop)
            stop_all_services
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $ACTION"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"