#!/bin/bash

###################################################################################
# BigQuery Optimizer - Cloud Run Deployment Script
###################################################################################
# This script deploys the BigQuery Optimizer to Google Cloud Run
# It handles both frontend and backend deployments
#
# Prerequisites:
# - Google Cloud SDK installed and configured
# - Docker installed (for frontend build)
# - Python 3.10+ installed
# - gcloud authenticated (gcloud auth login)
# - Project permissions for Cloud Run, Artifact Registry, and related services
###################################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration Variables - Modify these as needed
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME_BACKEND="${SERVICE_NAME_BACKEND:-bigquery-optimizer-backend}"
SERVICE_NAME_FRONTEND="${SERVICE_NAME_FRONTEND:-bigquery-optimizer-frontend}"
APP_NAME="${APP_NAME:-bigquery-optimizer}"
ARTIFACT_REGISTRY_REPO="${ARTIFACT_REGISTRY_REPO:-bigquery-optimizer}"
ENABLE_UI="${ENABLE_UI:-true}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-false}"
USE_CLOUD_BUILD=false  # Will be set by check_prerequisites

# Resource configuration
CPU="${CPU:-2}"
MEMORY="${MEMORY:-4Gi}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
TIMEOUT="${TIMEOUT:-600}"

# Print header
echo "=========================================="
echo "BigQuery Optimizer - Cloud Run Deployment"
echo "=========================================="
echo ""

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI not found. Please install Google Cloud SDK."
        exit 1
    fi
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 not found. Please install Python 3.10+."
        exit 1
    fi
    
    # Docker is optional - we can use Cloud Build
    if ! command -v docker &> /dev/null; then
        print_warning "Docker not found locally. Will use Cloud Build for container builds."
        export USE_CLOUD_BUILD=true
    else
        # Check if Docker daemon is running
        if ! docker ps &> /dev/null; then
            print_warning "Docker daemon not running. Will use Cloud Build for container builds."
            export USE_CLOUD_BUILD=true
        else
            export USE_CLOUD_BUILD=false
        fi
    fi
    
    print_success "Prerequisites check passed"
}

# Function to validate and set project configuration
setup_project() {
    print_info "Setting up project configuration..."
    
    # Get or prompt for project ID
    if [ -z "$PROJECT_ID" ]; then
        read -p "Enter your Google Cloud Project ID: " PROJECT_ID
    fi
    
    # Set the project
    gcloud config set project $PROJECT_ID
    
    # Enable required APIs
    print_info "Enabling required Google Cloud APIs..."
    gcloud services enable \
        run.googleapis.com \
        artifactregistry.googleapis.com \
        cloudbuild.googleapis.com \
        bigquery.googleapis.com \
        aiplatform.googleapis.com \
        --quiet
    
    print_success "Project configuration complete: $PROJECT_ID"
}

# Function to create Artifact Registry repository
setup_artifact_registry() {
    print_info "Setting up Artifact Registry..."
    
    # Check if repository exists
    if gcloud artifacts repositories describe $ARTIFACT_REGISTRY_REPO \
        --location=$REGION &> /dev/null; then
        print_info "Artifact Registry repository already exists"
    else
        print_info "Creating Artifact Registry repository..."
        gcloud artifacts repositories create $ARTIFACT_REGISTRY_REPO \
            --repository-format=docker \
            --location=$REGION \
            --description="BigQuery Optimizer Docker images"
    fi
    
    # Configure Docker authentication
    print_info "Configuring Docker authentication..."
    gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
    
    print_success "Artifact Registry setup complete"
}

# Function to build and deploy backend
deploy_backend() {
    print_info "Deploying backend service..."
    
    cd backend
    
    # Create a temporary main.py for Cloud Run deployment
    cat > main.py << 'EOF'
"""
Cloud Run entry point for BigQuery Optimizer Backend
"""
import os
import sys

# Set environment variables
os.environ["GOOGLE_CLOUD_PROJECT"] = os.getenv("GOOGLE_CLOUD_PROJECT", "")
os.environ["GOOGLE_CLOUD_LOCATION"] = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# Import and run the ADK server
from google.adk.cli.fast_api import serve_app

# Import our agent
from app.streaming_agent import root_agent

if __name__ == "__main__":
    # Start the ADK server
    import uvicorn
    from google.adk.cli.fast_api import create_app
    
    app = create_app(
        agent=root_agent,
        app_name="bigquery-optimizer",
        with_ui=True  # Enable the ADK UI
    )
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8080)),
        log_level="info"
    )
EOF
    
    # Create Dockerfile for backend
    cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY main.py .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

EXPOSE 8080

CMD ["python", "main.py"]
EOF
    
    # Build Docker image
    IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/${SERVICE_NAME_BACKEND}"
    
    if [ "$USE_CLOUD_BUILD" = "true" ]; then
        print_info "Building Docker image using Cloud Build..."
        gcloud builds submit \
            --tag $IMAGE_URL \
            --timeout=20m \
            --machine-type=n1-highcpu-8 \
            .
    else
        print_info "Building Docker image locally..."
        docker build -t $IMAGE_URL .
        
        print_info "Pushing Docker image to Artifact Registry..."
        docker push $IMAGE_URL
    fi
    
    # Deploy to Cloud Run
    print_info "Deploying backend to Cloud Run..."
    
    # Deploy using gcloud run deploy
    gcloud run deploy $SERVICE_NAME_BACKEND \
        --image=$IMAGE_URL \
        --region=$REGION \
        --platform=managed \
        --cpu=$CPU \
        --memory=$MEMORY \
        --max-instances=$MAX_INSTANCES \
        --min-instances=$MIN_INSTANCES \
        --timeout=$TIMEOUT \
        --port=8080 \
        --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_VERTEXAI=True" \
        --quiet
    
    
    # Handle authentication
    if [ "$ALLOW_UNAUTHENTICATED" = "true" ]; then
        print_info "Allowing unauthenticated access..."
        gcloud run services add-iam-policy-binding $SERVICE_NAME_BACKEND \
            --region=$REGION \
            --member="allUsers" \
            --role="roles/run.invoker" \
            --quiet
    fi
    
    # Get service URL
    BACKEND_URL=$(gcloud run services describe $SERVICE_NAME_BACKEND \
        --region=$REGION \
        --format='value(status.url)')
    
    print_success "Backend deployed successfully: $BACKEND_URL"
    
    # Clean up temporary files
    rm -f main.py Dockerfile
    
    cd ..
}

# Function to build and deploy frontend
deploy_frontend() {
    print_info "Deploying frontend service..."
    
    cd frontend
    
    # Get backend URL
    BACKEND_URL=$(gcloud run services describe $SERVICE_NAME_BACKEND \
        --region=$REGION \
        --format='value(status.url)')
    
    # Update frontend configuration to use backend URL
    print_info "Configuring frontend to use backend URL: $BACKEND_URL"
    
    # Create .env.production file
    cat > .env.production << EOF
VITE_API_URL=$BACKEND_URL
VITE_ADK_API_URL=$BACKEND_URL
EOF
    
    # Build frontend
    print_info "Building frontend..."
    npm install
    npm run build
    
    # Create nginx configuration
    cat > nginx.conf << 'EOF'
server {
    listen 8080;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # Handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy API requests to backend
    location /api {
        proxy_pass $BACKEND_URL;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF
    
    # Update Dockerfile to use environment variable
    cat > Dockerfile << EOF
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG BACKEND_URL
ENV VITE_API_URL=\$BACKEND_URL
ENV VITE_ADK_API_URL=\$BACKEND_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Use environment variable in nginx config
RUN echo "env BACKEND_URL;" >> /etc/nginx/nginx.conf
CMD ["nginx", "-g", "daemon off;"]
EXPOSE 8080
EOF
    
    # Build Docker image
    IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO}/${SERVICE_NAME_FRONTEND}"
    
    if [ "$USE_CLOUD_BUILD" = "true" ]; then
        print_info "Building Docker image using Cloud Build..."
        gcloud builds submit \
            --tag $IMAGE_URL \
            --timeout=20m \
            --machine-type=n1-highcpu-8 \
            --build-arg=BACKEND_URL=$BACKEND_URL \
            .
    else
        print_info "Building Docker image locally..."
        docker build --build-arg BACKEND_URL=$BACKEND_URL -t $IMAGE_URL .
        
        print_info "Pushing Docker image to Artifact Registry..."
        docker push $IMAGE_URL
    fi
    
    # Deploy to Cloud Run
    print_info "Deploying frontend to Cloud Run..."
    gcloud run deploy $SERVICE_NAME_FRONTEND \
        --image=$IMAGE_URL \
        --region=$REGION \
        --platform=managed \
        --cpu=$CPU \
        --memory=$MEMORY \
        --max-instances=$MAX_INSTANCES \
        --min-instances=$MIN_INSTANCES \
        --port=8080 \
        --set-env-vars="BACKEND_URL=$BACKEND_URL" \
        --quiet
    
    # Handle authentication
    if [ "$ALLOW_UNAUTHENTICATED" = "true" ]; then
        print_info "Allowing unauthenticated access..."
        gcloud run services add-iam-policy-binding $SERVICE_NAME_FRONTEND \
            --region=$REGION \
            --member="allUsers" \
            --role="roles/run.invoker" \
            --quiet
    fi
    
    # Get service URL
    FRONTEND_URL=$(gcloud run services describe $SERVICE_NAME_FRONTEND \
        --region=$REGION \
        --format='value(status.url)')
    
    print_success "Frontend deployed successfully: $FRONTEND_URL"
    
    # Clean up temporary files
    rm -f nginx.conf .env.production
    
    cd ..
}

# Function to create service account and set permissions
setup_permissions() {
    print_info "Setting up service account and permissions..."
    
    SERVICE_ACCOUNT="${APP_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Create service account if it doesn't exist
    if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT &> /dev/null; then
        print_info "Creating service account..."
        gcloud iam service-accounts create ${APP_NAME}-sa \
            --display-name="BigQuery Optimizer Service Account"
    fi
    
    # Grant necessary permissions
    print_info "Granting permissions to service account..."
    
    # BigQuery permissions
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/bigquery.dataViewer" \
        --quiet
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/bigquery.jobUser" \
        --quiet
    
    # Vertex AI permissions
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/aiplatform.user" \
        --quiet
    
    # Cloud Trace permissions (for monitoring)
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/cloudtrace.agent" \
        --quiet
    
    # Update Cloud Run services to use the service account
    print_info "Updating Cloud Run services to use service account..."
    
    gcloud run services update $SERVICE_NAME_BACKEND \
        --region=$REGION \
        --service-account=$SERVICE_ACCOUNT \
        --quiet
    
    print_success "Permissions setup complete"
}

# Function to display deployment summary
display_summary() {
    echo ""
    echo "=========================================="
    echo "Deployment Summary"
    echo "=========================================="
    echo ""
    echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
    echo ""
    echo "Project ID: $PROJECT_ID"
    echo "Region: $REGION"
    echo ""
    
    BACKEND_URL=$(gcloud run services describe $SERVICE_NAME_BACKEND \
        --region=$REGION \
        --format='value(status.url)' 2>/dev/null || echo "Not deployed")
    
    FRONTEND_URL=$(gcloud run services describe $SERVICE_NAME_FRONTEND \
        --region=$REGION \
        --format='value(status.url)' 2>/dev/null || echo "Not deployed")
    
    echo "Backend URL: $BACKEND_URL"
    echo "Frontend URL: $FRONTEND_URL"
    echo ""
    
    if [ "$ENABLE_UI" = "true" ]; then
        echo "ADK UI: ${BACKEND_URL}/docs"
    fi
    
    echo ""
    echo "To test the backend API:"
    echo "  curl ${BACKEND_URL}/health"
    echo ""
    echo "To view logs:"
    echo "  gcloud run logs read --service=$SERVICE_NAME_BACKEND --region=$REGION"
    echo "  gcloud run logs read --service=$SERVICE_NAME_FRONTEND --region=$REGION"
    echo ""
    
    if [ "$ALLOW_UNAUTHENTICATED" = "false" ]; then
        echo -e "${YELLOW}Note: Services require authentication. Use gcloud auth print-identity-token to get a token.${NC}"
    fi
    
    echo ""
    echo "To destroy all resources, run: ./destroy.sh"
    echo ""
}

# Main deployment flow
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --project)
                PROJECT_ID="$2"
                shift 2
                ;;
            --region)
                REGION="$2"
                shift 2
                ;;
            --backend-only)
                BACKEND_ONLY=true
                shift
                ;;
            --frontend-only)
                FRONTEND_ONLY=true
                shift
                ;;
            --allow-unauthenticated)
                ALLOW_UNAUTHENTICATED=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --project PROJECT_ID         Google Cloud project ID"
                echo "  --region REGION             Deployment region (default: us-central1)"
                echo "  --backend-only              Deploy only the backend service"
                echo "  --frontend-only             Deploy only the frontend service"
                echo "  --allow-unauthenticated     Allow public access without authentication"
                echo "  --help                      Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run deployment steps
    check_prerequisites
    setup_project
    setup_artifact_registry
    
    if [ "$FRONTEND_ONLY" != "true" ]; then
        deploy_backend
        setup_permissions
    fi
    
    if [ "$BACKEND_ONLY" != "true" ]; then
        deploy_frontend
    fi
    
    display_summary
}

# Run main function
main "$@"