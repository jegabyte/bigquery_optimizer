#!/bin/bash

# BigQuery Optimizer - Start Script
# This script starts both backend and frontend services
# Usage: ./start.sh [options]
# Options:
#   --backend     Start only backend service with logs in foreground
#   --frontend    Start only frontend service
#   --playground  Start only ADK playground
#   --all         Start all services (default)
#   --help        Show this help message

# Parse command line arguments
BACKEND_ONLY=false
FRONTEND_ONLY=false
PLAYGROUND_ONLY=false
SHOW_LOGS=false
START_ALL=true

for arg in "$@"; do
    case $arg in
        --backend)
            BACKEND_ONLY=true
            START_ALL=false
            SHOW_LOGS=true
            shift
            ;;
        --frontend)
            FRONTEND_ONLY=true
            START_ALL=false
            shift
            ;;
        --playground)
            PLAYGROUND_ONLY=true
            START_ALL=false
            shift
            ;;
        --all)
            START_ALL=true
            shift
            ;;
        --help|-h)
            echo "BigQuery Optimizer - Start Script"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --backend     Start only backend service with logs in foreground"
            echo "  --frontend    Start only frontend service"
            echo "  --playground  Start only ADK playground"
            echo "  --all         Start all services (default)"
            echo "  --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                # Start all services"
            echo "  $0 --backend      # Start only backend with logs"
            echo "  $0 --frontend     # Start only frontend"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "========================================"
echo "BigQuery Optimizer - Starting Services"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo -e "${YELLOW}Installing uv package manager...${NC}"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.local/bin/env
fi

# Function to kill process on port
kill_port() {
    local port=$1
    local service_name=$2
    
    echo -e "${YELLOW}Checking port $port...${NC}"
    
    # Find PID using the port
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        PID=$(lsof -ti:$port 2>/dev/null)
    else
        # Linux
        PID=$(lsof -ti:$port 2>/dev/null)
    fi
    
    if [ ! -z "$PID" ]; then
        echo -e "${RED}Killing existing process on port $port (PID: $PID)${NC}"
        kill -9 $PID 2>/dev/null
        sleep 1
        echo -e "${GREEN}✓ Port $port cleared${NC}"
    else
        echo -e "${GREEN}✓ Port $port is free${NC}"
    fi
}

# Function to start backend
start_backend() {
    echo -e "${GREEN}Starting ADK Backend...${NC}"
    
    # Kill any existing process on port 8000
    kill_port 8000 "Backend"
    
    cd backend
    
    # Install dependencies if needed
    if [ ! -d ".venv" ]; then
        echo "Installing backend dependencies..."
        source $HOME/.local/bin/env
        uv sync
    fi
    
    # Start ADK API server
    echo "Starting ADK API server on port 8000..."
    source $HOME/.local/bin/env
    
    if [ "$SHOW_LOGS" = true ]; then
        echo -e "${BLUE}Running backend in foreground with logs...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        echo ""
        uv run adk api_server app --port 8000
    else
        uv run adk api_server app --port 8000 &
        BACKEND_PID=$!
        echo "Backend PID: $BACKEND_PID"
        
        # Wait for backend to start
        sleep 3
        
        # Test backend
        if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Backend started successfully${NC}"
        else
            echo -e "${YELLOW}⚠ Backend may still be starting...${NC}"
        fi
    fi
    
    cd ..
}

# Function to start frontend
start_frontend() {
    echo -e "${GREEN}Starting Frontend...${NC}"
    
    # Kill any existing process on port 5173
    kill_port 5173 "Frontend"
    
    cd frontend
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi
    
    # Start frontend dev server
    echo "Starting frontend on port 5173..."
    npm run dev &
    FRONTEND_PID=$!
    echo "Frontend PID: $FRONTEND_PID"
    
    cd ..
}

# Function to start playground (optional)
start_playground() {
    echo -e "${GREEN}Starting ADK Playground...${NC}"
    
    # Kill any existing process on port 8501
    kill_port 8501 "Playground"
    
    cd backend
    source $HOME/.local/bin/env
    uv run adk web --port 8501 &
    PLAYGROUND_PID=$!
    echo "Playground PID: $PLAYGROUND_PID"
    cd ..
}

# Main execution based on flags
if [ "$BACKEND_ONLY" = true ]; then
    echo "Starting Backend Only..."
    start_backend
    
    if [ "$SHOW_LOGS" = false ]; then
        echo ""
        echo "========================================"
        echo -e "${GREEN}Backend started!${NC}"
        echo "========================================"
        echo ""
        echo "Backend API: http://localhost:8000"
        echo ""
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        
        trap "echo 'Stopping backend...'; kill $BACKEND_PID 2>/dev/null; exit" INT
        wait
    fi
    
elif [ "$FRONTEND_ONLY" = true ]; then
    echo "Starting Frontend Only..."
    start_frontend
    
    echo ""
    echo "========================================"
    echo -e "${GREEN}Frontend started!${NC}"
    echo "========================================"
    echo ""
    echo "Frontend: http://localhost:5173"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    
    trap "echo 'Stopping frontend...'; kill $FRONTEND_PID 2>/dev/null; exit" INT
    wait
    
elif [ "$PLAYGROUND_ONLY" = true ]; then
    echo "Starting ADK Playground Only..."
    start_playground
    
    echo ""
    echo "========================================"
    echo -e "${GREEN}ADK Playground started!${NC}"
    echo "========================================"
    echo ""
    echo "ADK Playground: http://localhost:8501"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    
    trap "echo 'Stopping playground...'; kill $PLAYGROUND_PID 2>/dev/null; exit" INT
    wait
    
else
    # Start all services (default behavior)
    echo "1. Starting Backend (ADK API Server)..."
    start_backend
    
    echo ""
    echo "2. Starting Frontend (React App)..."
    start_frontend
    
    echo ""
    echo -e "${YELLOW}Optional: Start ADK Playground? (y/n)${NC}"
    read -t 5 -r response || response="n"
    if [[ "$response" =~ ^[Yy]$ ]]; then
        start_playground
    fi
    
    echo ""
    echo "========================================"
    echo -e "${GREEN}All services started!${NC}"
    echo "========================================"
    echo ""
    echo "Access points:"
    echo "  • Frontend: http://localhost:5173"
    echo "  • Backend API: http://localhost:8000"
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "  • ADK Playground: http://localhost:8501"
    fi
    echo ""
    echo "Credentials:"
    echo "  • Username: admin"
    echo "  • Password: bigquery123"
    echo ""
    echo "Test with queries like:"
    echo "  • SELECT * FROM analytics.events"
    echo "  • SELECT * FROM bigquery-public-data.samples.shakespeare LIMIT 10"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    
    # Wait for user interrupt
    trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID $PLAYGROUND_PID 2>/dev/null; exit" INT
    wait
fi