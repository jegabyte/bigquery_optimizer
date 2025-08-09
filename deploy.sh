#!/bin/bash

# ================================================================
# BigQuery Optimizer - Deployment & Management Script
# ================================================================
# Usage:
#   ./deploy.sh              # Show help
#   ./deploy.sh deploy       # Deploy both frontend and backend
#   ./deploy.sh local        # Start local development
#   ./deploy.sh destroy      # Destroy all services
#   ./deploy.sh status       # Check deployment status
# ================================================================

set -e

# Configuration
PROJECT_ID="aiva-e74f3"
REGION="us-central1"
BACKEND_SERVICE="bigquery-optimizer-backend"
FRONTEND_SERVICE="bigquery-optimizer-frontend"

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

# Deploy Backend Function
deploy_backend() {
    print_header "Deploying Backend Service with ADK"
    
    cd backend/app
    
    print_info "Checking for virtual environment..."
    if [ -d "../.venv" ]; then
        source ../.venv/bin/activate
    else
        print_error "Virtual environment not found. Please run 'python -m venv .venv' in backend directory"
        exit 1
    fi
    
    print_info "Deploying with ADK..."
    adk deploy cloud_run \
        --project=$PROJECT_ID \
        --region=$REGION \
        --service_name=$BACKEND_SERVICE \
        --app_name=. \
        --with_ui \
        --port=8000 \
        --allow_origins="*" \
        .
    
    BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)')
    
    print_success "Backend deployed at: $BACKEND_URL"
    print_info "ADK UI available at: $BACKEND_URL/app/"
    print_info "API Docs available at: $BACKEND_URL/docs"
    cd ../..
}

# Deploy Frontend Function
deploy_frontend() {
    print_header "Deploying Frontend Service"
    
    cd frontend
    
    # Get backend URL
    BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -z "$BACKEND_URL" ]; then
        print_error "Backend service not found. Deploy backend first!"
        exit 1
    fi
    
    print_info "Backend URL: $BACKEND_URL"
    print_info "Building and deploying frontend..."
    
    # Update Dockerfile with correct backend URL
    sed -i.bak "s|ENV VITE_API_URL=.*|ENV VITE_API_URL=$BACKEND_URL|" Dockerfile
    rm -f Dockerfile.bak
    
    gcloud run deploy $FRONTEND_SERVICE \
        --source . \
        --region=$REGION \
        --allow-unauthenticated \
        --port=8080 \
        --memory=256Mi \
        --project=$PROJECT_ID \
        --set-env-vars="VITE_API_URL=$BACKEND_URL" \
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
    
    print_warning "This will delete both frontend and backend services."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deleting frontend service..."
        gcloud run services delete $FRONTEND_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --quiet 2>/dev/null || print_warning "Frontend service not found"
        
        print_info "Deleting backend service..."
        gcloud run services delete $BACKEND_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --quiet 2>/dev/null || print_warning "Backend service not found"
        
        print_success "Services destroyed"
    else
        print_info "Destruction cancelled"
    fi
}

# Start Local Development
start_local() {
    print_header "Starting Local Development Servers"
    
    # Start backend
    print_info "Starting backend server..."
    cd backend
    if [ -d ".venv" ]; then
        source .venv/bin/activate
        adk api_server app --port 8000 --allow_origins="*" &
        BACKEND_PID=$!
        print_success "Backend started on http://localhost:8000 (PID: $BACKEND_PID)"
    else
        print_error "Virtual environment not found. Run: cd backend && python -m venv .venv && pip install -r requirements.txt"
        exit 1
    fi
    cd ..
    
    # Start frontend
    print_info "Starting frontend server..."
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    print_success "Frontend starting on http://localhost:3000 or http://localhost:5173 (PID: $FRONTEND_PID)"
    cd ..
    
    echo ""
    print_info "Press Ctrl+C to stop all services"
    
    # Wait for interrupt
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
    wait
}

# Start Backend Only (Local)
start_backend_local() {
    print_header "Starting Backend Server (Local)"
    
    cd backend
    if [ -d ".venv" ]; then
        source .venv/bin/activate
        print_info "Starting ADK API server on port 8000..."
        adk api_server app --port 8000 --allow_origins="*"
    else
        print_error "Virtual environment not found. Run: python -m venv .venv && pip install -r requirements.txt"
        exit 1
    fi
}

# Start Frontend Only (Local)
start_frontend_local() {
    print_header "Starting Frontend Server (Local)"
    
    cd frontend
    print_info "Starting frontend development server..."
    npm run dev
}

# Check Status Function
check_status() {
    print_header "Deployment Status"
    
    echo ""
    echo "Project: $PROJECT_ID"
    echo "Region: $REGION"
    echo ""
    
    # Backend status
    BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format='value(status.url)' 2>/dev/null || echo "")
    
    if [ -n "$BACKEND_URL" ]; then
        print_success "Backend Service: DEPLOYED"
        echo "  URL: $BACKEND_URL"
        echo "  ADK UI: $BACKEND_URL/app/"
        echo "  API Docs: $BACKEND_URL/docs"
        
        # Get backend details
        BACKEND_DETAILS=$(gcloud run services describe $BACKEND_SERVICE \
            --region=$REGION \
            --project=$PROJECT_ID \
            --format='value(status.traffic[0].latestRevision,spec.template.spec.containers[0].resources.limits.memory)' 2>/dev/null)
        echo "  Latest Revision: $(echo $BACKEND_DETAILS | cut -d' ' -f1)"
        echo "  Memory: $(echo $BACKEND_DETAILS | cut -d' ' -f2)"
    else
        print_warning "Backend Service: NOT DEPLOYED"
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
    
    # Test backend health
    if [ -n "$BACKEND_URL" ]; then
        echo ""
        print_info "Testing backend health..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/docs" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            print_success "Backend is healthy (HTTP $HTTP_CODE)"
        elif [ "$HTTP_CODE" = "000" ]; then
            print_error "Backend is not reachable"
        else
            print_warning "Backend returned HTTP $HTTP_CODE"
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
    
    # Check if ADK is installed (for backend deployment)
    if [[ "${1:-both}" == "backend" ]] || [[ "${1:-both}" == "both" ]]; then
        if ! command -v adk &> /dev/null; then
            # Check in venv
            if [ -f "backend/.venv/bin/adk" ]; then
                print_info "ADK found in virtual environment"
            else
                print_error "ADK is not installed. Please install with: pip install google-adk"
                exit 1
            fi
        fi
    fi
    
    case "${1:-help}" in
        # Deployment commands
        deploy)
            deploy_backend
            echo ""
            deploy_frontend
            echo ""
            check_status
            ;;
        deploy-backend)
            deploy_backend
            ;;
        deploy-frontend)
            deploy_frontend
            ;;
        
        # Local development commands
        local|dev)
            start_local
            ;;
        local-backend)
            start_backend_local
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
            echo "DEPLOYMENT COMMANDS:"
            echo "  deploy           - Deploy both frontend and backend to Cloud Run"
            echo "  deploy-backend   - Deploy only backend service"
            echo "  deploy-frontend  - Deploy only frontend service"
            echo ""
            echo "LOCAL DEVELOPMENT:"
            echo "  local (or dev)   - Start both services locally"
            echo "  local-backend    - Start only backend locally"
            echo "  local-frontend   - Start only frontend locally"
            echo ""
            echo "MANAGEMENT:"
            echo "  status           - Check deployment status"
            echo "  destroy          - Delete all Cloud Run services"
            echo ""
            echo "CONFIGURATION:"
            echo "  Project:  $PROJECT_ID"
            echo "  Region:   $REGION"
            echo "  Backend:  $BACKEND_SERVICE"
            echo "  Frontend: $FRONTEND_SERVICE"
            echo ""
            echo "EXAMPLES:"
            echo "  $0 local          # Start local development"
            echo "  $0 deploy         # Deploy to Cloud Run"
            echo "  $0 status         # Check deployment status"
            echo "  $0 destroy        # Remove all services"
            exit 0
            ;;
    esac
}

# Run main function
main "$@"