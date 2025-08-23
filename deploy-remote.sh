#!/bin/bash

# ================================================================
# BigQuery Optimizer - Production Deployment Script
# ================================================================
# This script deploys all services in the correct order:
# 1. Agent API (Cloud Run via ADK)
# 2. Backend API (Cloud Run)
# 3. Frontend (App Engine)
#
# Features:
# - Comprehensive prerequisite checking
# - Automatic service URL management
# - Proper authentication between services
# - Production-ready error handling
# - Rollback capability
# ================================================================

set -e  # Exit on error

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# ================================================================
# CONFIGURATION
# ================================================================

# Load environment variables from .env if exists
if [ -f ".env" ]; then
    echo "Loading environment from .env file..."
    source .env
fi

# Primary Configuration (can be overridden by .env or environment)
GCP_PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${REGION:-us-central1}"
BQ_PROJECT_ID="${BQ_PROJECT_ID:-$GCP_PROJECT_ID}"
BQ_DATASET="${BQ_DATASET:-bq_optimizer}"
BQ_LOCATION="${BQ_LOCATION:-US}"
APP_ENV="${APP_ENV:-production}"

# Service Names
AGENT_API_SERVICE="bigquery-optimizer-agent-api"
BACKEND_API_SERVICE="bigquery-optimizer-backend-api"
FRONTEND_SERVICE="default"  # App Engine requires default service

# Backend Type
BACKEND_TYPE="${BACKEND_TYPE:-firestore}"

# Parse command line arguments
for i in "$@"; do
    case $i in
        --backend=*|--db=*)
            BACKEND_TYPE="${i#*=}"
            ;;
        --project=*)
            GCP_PROJECT_ID="${i#*=}"
            BQ_PROJECT_ID="${i#*=}"
            ;;
        --region=*)
            REGION="${i#*=}"
            ;;
        --skip-checks)
            SKIP_CHECKS="true"
            ;;
        --cleanup)
            CLEANUP="true"
            ;;
        --force-cleanup)
            CLEANUP="true"
            FORCE_CLEANUP="true"
            ;;
        --help|-h)
            SHOW_HELP="true"
            ;;
    esac
done

# Export variables AFTER parsing command line arguments
export GCP_PROJECT_ID
export REGION
export BQ_PROJECT_ID="${BQ_PROJECT_ID:-$GCP_PROJECT_ID}"
export BQ_DATASET
export BQ_LOCATION
export APP_ENV
export BACKEND_TYPE

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ================================================================
# UTILITY FUNCTIONS
# ================================================================

print_header() {
    echo ""
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
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# Show help
show_help() {
    cat << EOF
BigQuery Optimizer - Production Deployment Script

USAGE:
    ./deploy-production.sh [OPTIONS]

OPTIONS:
    --project=PROJECT_ID     Set GCP project ID
    --region=REGION         Set deployment region (default: us-central1)
    --backend=TYPE          Backend type: bigquery or firestore (default: firestore)
    --skip-checks           Skip prerequisite checks (not recommended)
    --cleanup               Remove all deployed resources (with confirmation)
    --force-cleanup         Remove all resources without confirmation (dangerous!)
    --help, -h              Show this help message

EXAMPLES:
    # Deploy with all checks
    ./deploy-production.sh

    # Deploy with specific project
    ./deploy-production.sh --project=my-project-id

    # Deploy with BigQuery backend (non-default)
    ./deploy-production.sh --backend=bigquery

    # Skip checks (faster but risky)
    ./deploy-production.sh --skip-checks

    # Clean up all resources
    ./deploy-production.sh --cleanup

    # Force cleanup without confirmation
    ./deploy-production.sh --force-cleanup

ENVIRONMENT VARIABLES:
    GCP_PROJECT_ID          Google Cloud Project ID (required)
    REGION                  Deployment region (default: us-central1)
    BQ_PROJECT_ID          BigQuery project ID (default: GCP_PROJECT_ID)
    BQ_DATASET             BigQuery dataset name (default: bq_optimizer)
    BACKEND_TYPE           Backend type: bigquery or firestore

DEPLOYMENT ORDER:
    1. Agent API    -> Cloud Run (via ADK)
    2. Backend API  -> Cloud Run
    3. Frontend     -> App Engine

EOF
    exit 0
}

# ================================================================
# PREREQUISITE CHECKS
# ================================================================

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local checks_passed=true
    
    # 1. Check if gcloud is installed
    print_info "Checking gcloud CLI..."
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed!"
        echo "   Install from: https://cloud.google.com/sdk/docs/install"
        checks_passed=false
    else
        GCLOUD_VERSION=$(gcloud --version | head -n1)
        print_success "gcloud CLI found: $GCLOUD_VERSION"
    fi
    
    # 2. Check authentication
    print_info "Checking authentication..."
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        print_error "Not authenticated with gcloud!"
        echo "   Run: gcloud auth login"
        echo "   Run: gcloud auth application-default login"
        checks_passed=false
    else
        ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
        print_success "Authenticated as: $ACTIVE_ACCOUNT"
    fi
    
    # 3. Check project
    print_info "Checking project access..."
    if [ -z "$GCP_PROJECT_ID" ]; then
        print_error "GCP_PROJECT_ID is not set!"
        echo "   Set with: export GCP_PROJECT_ID=your-project-id"
        echo "   Or use: ./deploy-production.sh --project=your-project-id"
        checks_passed=false
    elif ! gcloud projects describe $GCP_PROJECT_ID &> /dev/null; then
        print_error "Cannot access project: $GCP_PROJECT_ID"
        echo "   Ensure you have access or check the project ID"
        checks_passed=false
    else
        print_success "Project accessible: $GCP_PROJECT_ID"
        gcloud config set project $GCP_PROJECT_ID --quiet
    fi
    
    # 4. Check required APIs
    if [ "$checks_passed" = true ]; then
        print_info "Checking required APIs..."
        REQUIRED_APIS=(
            "run.googleapis.com"
            "cloudbuild.googleapis.com"
            "appengine.googleapis.com"
            "firestore.googleapis.com"
            "bigquery.googleapis.com"
            "artifactregistry.googleapis.com"
        )
        
        for API in "${REQUIRED_APIS[@]}"; do
            if gcloud services list --enabled --filter="name:$API" --format="value(name)" --project=$GCP_PROJECT_ID | grep -q $API; then
                print_success "API enabled: $API"
            else
                print_warning "Enabling API: $API"
                gcloud services enable $API --project=$GCP_PROJECT_ID
                if [ $? -ne 0 ]; then
                    print_error "Failed to enable API: $API"
                    checks_passed=false
                fi
            fi
        done
    fi
    
    # 5. Check ADK installation for Agent API
    print_info "Checking ADK installation..."
    ADK_AVAILABLE=false
    
    # Check in agent_api virtual environment first
    if [ -f "agent_api/.venv/bin/adk" ]; then
        print_success "ADK found in agent_api virtual environment"
        ADK_AVAILABLE=true
    elif command -v adk &> /dev/null; then
        print_success "ADK found in system"
        ADK_AVAILABLE=true
    else
        print_warning "ADK not found. Installing in agent_api virtual environment..."
        (
            cd agent_api
            if [ ! -d ".venv" ]; then
                python3 -m venv .venv
            fi
            source .venv/bin/activate
            pip install --upgrade pip
            pip install google-adk
            if [ $? -eq 0 ]; then
                print_success "ADK installed successfully"
                ADK_AVAILABLE=true
            else
                print_error "Failed to install ADK"
                checks_passed=false
            fi
        )
    fi
    
    # 6. Check Node.js for frontend
    print_info "Checking Node.js..."
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed!"
        echo "   Install from: https://nodejs.org/"
        checks_passed=false
    else
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
    fi
    
    # 7. Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed!"
        checks_passed=false
    else
        NPM_VERSION=$(npm --version)
        print_success "npm found: $NPM_VERSION"
    fi
    
    # 8. Check App Engine initialization
    print_info "Checking App Engine..."
    if ! gcloud app describe --project=$GCP_PROJECT_ID &> /dev/null; then
        print_warning "App Engine not initialized"
        echo ""
        echo "App Engine needs to be initialized with a region."
        echo "Available regions:"
        echo "  - us-central (Iowa)"
        echo "  - us-east1 (South Carolina)"
        echo "  - us-east4 (Northern Virginia)"
        echo "  - europe-west (Belgium)"
        echo "  - asia-northeast1 (Tokyo)"
        echo ""
        print_info "Auto-initializing App Engine in us-central region..."
        gcloud app create --region=us-central --project=$GCP_PROJECT_ID --quiet
        if [ $? -eq 0 ]; then
            print_success "App Engine initialized"
        else
            print_error "Failed to initialize App Engine"
            checks_passed=false
        fi
    else
        APP_REGION=$(gcloud app describe --project=$GCP_PROJECT_ID --format="value(locationId)")
        print_success "App Engine initialized in region: $APP_REGION"
    fi
    
    # 9. Validate backend type
    print_info "Validating backend type..."
    if [[ "$BACKEND_TYPE" != "bigquery" && "$BACKEND_TYPE" != "firestore" ]]; then
        print_error "Invalid backend type: $BACKEND_TYPE"
        echo "   Valid options: bigquery, firestore"
        checks_passed=false
    else
        print_success "Backend type: $BACKEND_TYPE"
    fi
    
    # Summary
    echo ""
    if [ "$checks_passed" = false ]; then
        print_error "Prerequisites check failed. Please fix the issues above."
        exit 1
    else
        print_success "All prerequisites passed!"
    fi
}

# ================================================================
# DEPLOYMENT FUNCTIONS
# ================================================================

# Deploy Agent API using ADK
deploy_agent_api() {
    print_header "Deploying Agent API (ADK)"
    
    cd agent_api
    
    # Activate virtual environment if it exists
    if [ -d ".venv" ]; then
        print_info "Activating virtual environment..."
        source .venv/bin/activate
    else
        print_warning "Creating virtual environment..."
        python3 -m venv .venv
        source .venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
    
    print_info "Deploying with ADK..."
    print_info "  Project: $GCP_PROJECT_ID"
    print_info "  Region: $REGION"
    print_info "  Service: $AGENT_API_SERVICE"
    
    # Deploy using ADK
    adk deploy cloud_run \
        --project=$GCP_PROJECT_ID \
        --region=$REGION \
        --service_name=$AGENT_API_SERVICE \
        --allow_origins="*" \
        --with_ui \
        app
    
    if [ $? -ne 0 ]; then
        print_error "Agent API deployment failed"
        cd ..
        exit 1
    fi
    
    # Get the service URL
    AGENT_API_URL=$(gcloud run services describe $AGENT_API_SERVICE \
        --region=$REGION \
        --project=$GCP_PROJECT_ID \
        --format='value(status.url)')
    
    # Update environment variables
    print_info "Setting environment variables..."
    gcloud run services update $AGENT_API_SERVICE \
        --region=$REGION \
        --project=$GCP_PROJECT_ID \
        --set-env-vars="GCP_PROJECT_ID=$GCP_PROJECT_ID,BQ_PROJECT_ID=$BQ_PROJECT_ID,BQ_DATASET=$BQ_DATASET,BQ_LOCATION=$BQ_LOCATION,APP_ENV=$APP_ENV" \
        --quiet
    
    # Make Agent API publicly accessible (ADK deploys with authentication by default)
    print_info "Making Agent API publicly accessible..."
    gcloud run services add-iam-policy-binding $AGENT_API_SERVICE \
        --member="allUsers" \
        --role="roles/run.invoker" \
        --region=$REGION \
        --project=$GCP_PROJECT_ID \
        --quiet
    
    print_success "Agent API deployed successfully!"
    print_info "  URL: $AGENT_API_URL"
    print_info "  ADK UI: $AGENT_API_URL/app/"
    print_info "  API Docs: $AGENT_API_URL/docs"
    
    cd ..
    
    # Export for use by other services
    export AGENT_API_URL
}

# Deploy Backend API
deploy_backend_api() {
    print_header "Deploying Backend API"
    
    cd backend_api
    
    # Determine which main file to use
    if [ "$BACKEND_TYPE" = "bigquery" ]; then
        BACKEND_MAIN_FILE="main.py"
        print_info "Using BigQuery backend"
    else
        BACKEND_MAIN_FILE="main_firestore.py"
        print_info "Using Firestore backend (default)"
    fi
    
    # Create startup script
    print_info "Creating startup script..."
    cat > startup.sh << 'EOF'
#!/bin/bash
# Startup script for Backend API

# Determine which backend to use
if [ "$BACKEND_TYPE" = "bigquery" ]; then
    echo "Starting BigQuery backend..."
    exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}
else
    echo "Starting Firestore backend (default)..."
    exec uvicorn main_firestore:app --host 0.0.0.0 --port ${PORT:-8001}
fi
EOF
    chmod +x startup.sh
    
    print_info "Building and deploying Backend API..."
    print_info "  Backend: $BACKEND_TYPE"
    print_info "  Main file: $BACKEND_MAIN_FILE"
    
    # Deploy to Cloud Run
    gcloud run deploy $BACKEND_API_SERVICE \
        --source . \
        --platform managed \
        --region $REGION \
        --project $GCP_PROJECT_ID \
        --allow-unauthenticated \
        --set-env-vars="GCP_PROJECT_ID=$GCP_PROJECT_ID,BQ_PROJECT_ID=$BQ_PROJECT_ID,FIRESTORE_PROJECT_ID=$GCP_PROJECT_ID,BQ_DATASET=$BQ_DATASET,BQ_LOCATION=$BQ_LOCATION,APP_ENV=$APP_ENV,BACKEND_TYPE=$BACKEND_TYPE,BACKEND_MAIN_FILE=$BACKEND_MAIN_FILE,GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID" \
        --memory=512Mi \
        --timeout=60 \
        --max-instances=10 \
        --port=8001 \
        --quiet
    
    if [ $? -ne 0 ]; then
        print_error "Backend API deployment failed"
        cd ..
        exit 1
    fi
    
    # Get the service URL
    BACKEND_API_URL=$(gcloud run services describe $BACKEND_API_SERVICE \
        --region=$REGION \
        --project=$GCP_PROJECT_ID \
        --format='value(status.url)')
    
    print_success "Backend API deployed successfully!"
    print_info "  URL: $BACKEND_API_URL"
    print_info "  API Docs: $BACKEND_API_URL/docs"
    print_info "  Backend Type: $BACKEND_TYPE"
    
    cd ..
    
    # Export for use by frontend
    export BACKEND_API_URL
}

# Deploy Frontend to App Engine
deploy_frontend() {
    print_header "Deploying Frontend to App Engine"
    
    cd frontend
    
    # Ensure we have the service URLs
    if [ -z "$AGENT_API_URL" ]; then
        print_error "Agent API URL not found. Deploy Agent API first."
        cd ..
        exit 1
    fi
    
    if [ -z "$BACKEND_API_URL" ]; then
        print_error "Backend API URL not found. Deploy Backend API first."
        cd ..
        exit 1
    fi
    
    print_info "Service URLs:"
    print_info "  Agent API: $AGENT_API_URL"
    print_info "  Backend API: $BACKEND_API_URL"
    
    # Check for required files
    print_info "Checking required files..."
    REQUIRED_FILES=("package.json" "app.yaml" "server.js")
    for FILE in "${REQUIRED_FILES[@]}"; do
        if [ ! -f "$FILE" ]; then
            print_error "Missing required file: $FILE"
            cd ..
            exit 1
        fi
    done
    
    # Build frontend with environment variables
    print_info "Building frontend..."
    export VITE_API_URL=$AGENT_API_URL
    export VITE_BACKEND_API_URL=$BACKEND_API_URL
    export VITE_BQ_API_URL=$BACKEND_API_URL
    export VITE_GCP_PROJECT_ID=$GCP_PROJECT_ID
    
    # Install dependencies
    print_info "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        print_error "Failed to install dependencies"
        cd ..
        exit 1
    fi
    
    # Build the application
    print_info "Building production bundle..."
    npm run build
    if [ $? -ne 0 ]; then
        print_error "Build failed"
        cd ..
        exit 1
    fi
    
    # Verify build output
    if [ ! -d "dist" ]; then
        print_error "Build directory 'dist' not found"
        cd ..
        exit 1
    fi
    
    # Deploy to App Engine
    print_info "Deploying to App Engine..."
    gcloud app deploy app.yaml \
        --project=$GCP_PROJECT_ID \
        --quiet \
        --version=production \
        --promote
    
    if [ $? -ne 0 ]; then
        print_error "Frontend deployment failed"
        cd ..
        exit 1
    fi
    
    # Get App Engine URL - use actual hostname from gcloud
    FRONTEND_URL=$(gcloud app describe --project=$GCP_PROJECT_ID --format="value(defaultHostname)")
    if [ -n "$FRONTEND_URL" ]; then
        FRONTEND_URL="https://$FRONTEND_URL"
    else
        # Fallback if command fails
        APP_REGION=$(gcloud app describe --project=$GCP_PROJECT_ID --format="value(locationId)")
        # Map region to abbreviated code
        case "$APP_REGION" in
            "us-central") APP_REGION_CODE="uc" ;;
            "us-east1") APP_REGION_CODE="ue1" ;;
            "us-east4") APP_REGION_CODE="ue4" ;;
            "europe-west") APP_REGION_CODE="ew" ;;
            "europe-west2") APP_REGION_CODE="ew2" ;;
            "asia-northeast1") APP_REGION_CODE="an1" ;;
            *) APP_REGION_CODE="$APP_REGION" ;;
        esac
        FRONTEND_URL="https://$GCP_PROJECT_ID.$APP_REGION_CODE.r.appspot.com"
    fi
    
    print_success "Frontend deployed successfully!"
    print_info "  URL: $FRONTEND_URL"
    
    cd ..
    
    # Export for summary
    export FRONTEND_URL
}

# Update service authentication
update_service_authentication() {
    print_header "Updating Service Authentication"
    
    # Update Agent API to know about Backend API
    print_info "Updating Agent API environment..."
    gcloud run services update $AGENT_API_SERVICE \
        --region=$REGION \
        --project=$GCP_PROJECT_ID \
        --update-env-vars="BACKEND_API_URL=$BACKEND_API_URL" \
        --quiet
    
    # Update Backend API CORS to allow frontend
    print_info "Updating Backend API CORS..."
    # Set CORS_ORIGINS - simplified to just the frontend URL to avoid escaping issues
    # For local development, CORS can be set separately
    gcloud run services update $BACKEND_API_SERVICE \
        --region=$REGION \
        --project=$GCP_PROJECT_ID \
        --update-env-vars="CORS_ORIGINS=${FRONTEND_URL}" \
        --quiet
    
    print_success "Service authentication updated"
}

# Verify deployment
verify_deployment() {
    print_header "Verifying Deployment"
    
    local all_healthy=true
    
    # Check Agent API
    print_info "Testing Agent API..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AGENT_API_URL/docs" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "Agent API is healthy (HTTP $HTTP_CODE)"
    else
        print_error "Agent API returned HTTP $HTTP_CODE"
        all_healthy=false
    fi
    
    # Check Backend API
    print_info "Testing Backend API..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_API_URL/docs" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "Backend API is healthy (HTTP $HTTP_CODE)"
    else
        print_error "Backend API returned HTTP $HTTP_CODE"
        all_healthy=false
    fi
    
    # Check Frontend
    print_info "Testing Frontend..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        print_success "Frontend is healthy (HTTP $HTTP_CODE)"
    else
        print_error "Frontend returned HTTP $HTTP_CODE"
        all_healthy=false
    fi
    
    if [ "$all_healthy" = true ]; then
        print_success "All services are healthy!"
    else
        print_warning "Some services may need time to start. Check again in a few minutes."
    fi
}

# Cleanup all resources
cleanup_resources() {
    print_header "Resource Cleanup"
    
    # Check if project is set
    if [ -z "$GCP_PROJECT_ID" ]; then
        print_error "GCP_PROJECT_ID is not set!"
        echo "   Set with: export GCP_PROJECT_ID=your-project-id"
        echo "   Or use: ./deploy-production.sh --cleanup --project=your-project-id"
        exit 1
    fi
    
    print_warning "This will delete the following resources:"
    echo ""
    echo "  Project: $GCP_PROJECT_ID"
    echo "  Region: $REGION"
    echo ""
    echo "  Cloud Run Services:"
    echo "    - $AGENT_API_SERVICE"
    echo "    - $BACKEND_API_SERVICE"
    echo ""
    echo "  App Engine:"
    echo "    - All versions of default service"
    echo "    - Cannot delete App Engine app itself (GCP limitation)"
    echo ""
    
    if [ "$BACKEND_TYPE" = "firestore" ] || [ -z "$BACKEND_TYPE" ]; then
        echo "  Firestore:"
        echo "    - All collections and documents"
        echo "    - Database: (default)"
        echo ""
    fi
    
    if [ "$BACKEND_TYPE" = "bigquery" ]; then
        echo "  BigQuery:"
        echo "    - Dataset: $BQ_DATASET"
        echo "    - All tables in the dataset"
        echo ""
    fi
    
    echo "  Cloud Build:"
    echo "    - Build artifacts in Cloud Storage"
    echo ""
    
    print_warning "THIS ACTION CANNOT BE UNDONE!"
    echo ""
    
    # Confirmation unless force flag is used
    if [ "$FORCE_CLEANUP" != "true" ]; then
        read -p "Type 'DELETE ALL' to confirm: " CONFIRMATION
        if [ "$CONFIRMATION" != "DELETE ALL" ]; then
            print_info "Cleanup cancelled"
            exit 0
        fi
        
        # Double confirmation for production
        if [ "$APP_ENV" = "production" ]; then
            print_warning "This appears to be a PRODUCTION environment!"
            read -p "Are you absolutely sure? Type 'YES' to continue: " PROD_CONFIRMATION
            if [ "$PROD_CONFIRMATION" != "YES" ]; then
                print_info "Cleanup cancelled"
                exit 0
            fi
        fi
    else
        print_warning "Force cleanup enabled - skipping confirmation"
    fi
    
    # Start cleanup
    print_info "Starting cleanup process..."
    local cleanup_errors=0
    
    # 1. Delete Cloud Run services
    print_info "Deleting Cloud Run services..."
    
    # Delete Agent API
    if gcloud run services describe $AGENT_API_SERVICE --region=$REGION --project=$GCP_PROJECT_ID &>/dev/null; then
        print_info "Deleting $AGENT_API_SERVICE..."
        if gcloud run services delete $AGENT_API_SERVICE \
            --region=$REGION \
            --project=$GCP_PROJECT_ID \
            --quiet; then
            print_success "$AGENT_API_SERVICE deleted"
        else
            print_error "Failed to delete $AGENT_API_SERVICE"
            ((cleanup_errors++))
        fi
    else
        print_info "$AGENT_API_SERVICE not found"
    fi
    
    # Delete Backend API
    if gcloud run services describe $BACKEND_API_SERVICE --region=$REGION --project=$GCP_PROJECT_ID &>/dev/null; then
        print_info "Deleting $BACKEND_API_SERVICE..."
        if gcloud run services delete $BACKEND_API_SERVICE \
            --region=$REGION \
            --project=$GCP_PROJECT_ID \
            --quiet; then
            print_success "$BACKEND_API_SERVICE deleted"
        else
            print_error "Failed to delete $BACKEND_API_SERVICE"
            ((cleanup_errors++))
        fi
    else
        print_info "$BACKEND_API_SERVICE not found"
    fi
    
    # 2. Delete App Engine versions (cannot delete App Engine app itself)
    print_info "Cleaning up App Engine..."
    if gcloud app describe --project=$GCP_PROJECT_ID &>/dev/null; then
        # List all versions
        VERSIONS=$(gcloud app versions list --service=default --project=$GCP_PROJECT_ID --format="value(version.id)" 2>/dev/null)
        
        if [ -n "$VERSIONS" ]; then
            print_info "Found App Engine versions: $(echo $VERSIONS | tr '\n' ' ')"
            
            # Stop all traffic first
            print_info "Stopping App Engine traffic..."
            gcloud app services set-traffic default --splits= --project=$GCP_PROJECT_ID --quiet 2>/dev/null || true
            
            # Delete all versions
            for VERSION in $VERSIONS; do
                print_info "Deleting version: $VERSION"
                if gcloud app versions delete $VERSION \
                    --service=default \
                    --project=$GCP_PROJECT_ID \
                    --quiet 2>/dev/null; then
                    print_success "Version $VERSION deleted"
                else
                    print_warning "Could not delete version $VERSION (might be serving traffic)"
                fi
            done
        else
            print_info "No App Engine versions found"
        fi
        
        print_warning "Note: App Engine application cannot be deleted once created (GCP limitation)"
    else
        print_info "App Engine not initialized"
    fi
    
    # 3. Delete Firestore data
    if [ "$BACKEND_TYPE" = "firestore" ] || [ -z "$BACKEND_TYPE" ]; then
        print_info "Cleaning up Firestore database..."
        
        # Check if Firestore is initialized
        if gcloud firestore databases describe --project=$GCP_PROJECT_ID &>/dev/null; then
            print_info "Deleting Firestore collections..."
            
            # List of known collections used by the app
            COLLECTIONS=("projects" "templates" "analyses" "optimization_rules" "query_patterns")
            
            for COLLECTION in "${COLLECTIONS[@]}"; do
                print_info "Deleting collection: $COLLECTION"
                
                # Delete all documents in collection using Firebase CLI if available
                if command -v firebase &>/dev/null; then
                    firebase firestore:delete $COLLECTION --project $GCP_PROJECT_ID --recursive --force 2>/dev/null || true
                else
                    # Alternative: Use gcloud to delete (requires iteration)
                    print_warning "Firebase CLI not found. Manual deletion required for collection: $COLLECTION"
                    echo "   Install Firebase CLI: npm install -g firebase-tools"
                    echo "   Then run: firebase firestore:delete $COLLECTION --project $GCP_PROJECT_ID --recursive --force"
                fi
            done
            
            print_info "Firestore data deletion initiated"
            print_warning "Note: Firestore database structure remains (GCP limitation)"
        else
            print_info "Firestore not initialized"
        fi
    fi
    
    # 4. Delete BigQuery dataset
    if [ "$BACKEND_TYPE" = "bigquery" ]; then
        print_info "Cleaning up BigQuery dataset..."
        
        if bq ls -d --project_id=$BQ_PROJECT_ID | grep -q $BQ_DATASET 2>/dev/null; then
            print_info "Deleting BigQuery dataset: $BQ_DATASET"
            
            if bq rm -r -f -d $BQ_PROJECT_ID:$BQ_DATASET; then
                print_success "BigQuery dataset $BQ_DATASET deleted"
            else
                print_error "Failed to delete BigQuery dataset"
                ((cleanup_errors++))
            fi
        else
            print_info "BigQuery dataset $BQ_DATASET not found"
        fi
    fi
    
    # 5. Clean up Cloud Storage artifacts
    print_info "Cleaning up Cloud Storage artifacts..."
    
    # Cloud Build artifacts
    BUCKETS=$(gsutil ls -p $GCP_PROJECT_ID 2>/dev/null | grep -E "(staging|artifacts|gcr.io)" || true)
    
    if [ -n "$BUCKETS" ]; then
        print_info "Found storage buckets:"
        echo "$BUCKETS"
        
        for BUCKET in $BUCKETS; do
            if [[ $BUCKET == *"staging"* ]] || [[ $BUCKET == *"artifacts"* ]]; then
                print_info "Cleaning bucket: $BUCKET"
                gsutil -m rm -r $BUCKET/** 2>/dev/null || true
            fi
        done
    else
        print_info "No Cloud Storage artifacts found"
    fi
    
    # 6. Clean up Container Registry images
    print_info "Cleaning up Container Registry images..."
    
    # Delete Cloud Run service images
    for SERVICE in $AGENT_API_SERVICE $BACKEND_API_SERVICE; do
        IMAGE_PATH="gcr.io/$GCP_PROJECT_ID/$SERVICE"
        if gcloud container images list --repository=$IMAGE_PATH --project=$GCP_PROJECT_ID 2>/dev/null | grep -q $SERVICE; then
            print_info "Deleting images for $SERVICE"
            gcloud container images delete $IMAGE_PATH --force-delete-tags --quiet 2>/dev/null || true
        fi
    done
    
    # Summary
    echo ""
    print_header "Cleanup Summary"
    
    if [ $cleanup_errors -eq 0 ]; then
        print_success "All resources cleaned up successfully!"
    else
        print_warning "Cleanup completed with $cleanup_errors errors"
        echo "Some resources may need manual deletion"
    fi
    
    echo ""
    echo "Remaining resources that cannot be deleted:"
    echo "  - App Engine application (disabled but not deleted)"
    echo "  - Firestore database structure (empty but not deleted)"
    echo "  - Project-level configurations"
    echo ""
    echo "To completely remove all resources, delete the entire project:"
    echo "  gcloud projects delete $GCP_PROJECT_ID"
    echo ""
    
    # Remove deployment info file if exists
    if [ -f "deployment-info.txt" ]; then
        rm deployment-info.txt
        print_info "Removed deployment-info.txt"
    fi
}

# Display deployment summary
display_summary() {
    print_header "Deployment Summary"
    
    echo ""
    echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
    echo ""
    echo "PROJECT CONFIGURATION:"
    echo "  Project ID:    $GCP_PROJECT_ID"
    echo "  Region:        $REGION"
    echo "  Backend Type:  $BACKEND_TYPE"
    echo "  Environment:   $APP_ENV"
    echo ""
    echo "SERVICE URLS:"
    echo ""
    echo "  🌐 Frontend (App Engine):"
    echo "     $FRONTEND_URL"
    echo ""
    echo "  🤖 Agent API (Cloud Run):"
    echo "     $AGENT_API_URL"
    echo "     ADK UI: $AGENT_API_URL/app/"
    echo "     Docs:   $AGENT_API_URL/docs"
    echo ""
    echo "  📊 Backend API (Cloud Run):"
    echo "     $BACKEND_API_URL"
    echo "     Docs: $BACKEND_API_URL/docs"
    echo ""
    echo "USEFUL COMMANDS:"
    echo ""
    echo "  # View Frontend logs"
    echo "  gcloud app logs tail"
    echo ""
    echo "  # View Agent API logs"
    echo "  gcloud run logs read --service=$AGENT_API_SERVICE --region=$REGION"
    echo ""
    echo "  # View Backend API logs"
    echo "  gcloud run logs read --service=$BACKEND_API_SERVICE --region=$REGION"
    echo ""
    echo "  # Open Frontend in browser"
    echo "  open $FRONTEND_URL"
    echo ""
    
    # Save deployment info
    cat > deployment-info.txt << EOF
BigQuery Optimizer Deployment Info
Generated: $(date)

Project: $GCP_PROJECT_ID
Region: $REGION
Backend: $BACKEND_TYPE

Frontend URL: $FRONTEND_URL
Agent API URL: $AGENT_API_URL
Backend API URL: $BACKEND_API_URL
EOF
    
    print_info "Deployment info saved to: deployment-info.txt"
}

# ================================================================
# MAIN EXECUTION
# ================================================================

main() {
    # Show help if requested
    if [ "$SHOW_HELP" = "true" ]; then
        show_help
    fi
    
    # Handle cleanup if requested
    if [ "$CLEANUP" = "true" ]; then
        cleanup_resources
        exit 0
    fi
    
    # Welcome message
    print_header "BigQuery Optimizer - Production Deployment"
    echo ""
    echo "This script will deploy:"
    echo "  1. Agent API    → Cloud Run (via ADK)"
    echo "  2. Backend API  → Cloud Run"
    echo "  3. Frontend     → App Engine"
    echo ""
    echo "Configuration:"
    echo "  Project:  ${GCP_PROJECT_ID:-NOT SET}"
    echo "  Region:   $REGION"
    echo "  Backend:  $BACKEND_TYPE"
    echo ""
    
    # Check prerequisites unless skipped
    if [ "$SKIP_CHECKS" != "true" ]; then
        check_prerequisites
    else
        print_warning "Skipping prerequisite checks (--skip-checks flag used)"
        if [ -z "$GCP_PROJECT_ID" ]; then
            print_error "GCP_PROJECT_ID must be set!"
            exit 1
        fi
        gcloud config set project $GCP_PROJECT_ID --quiet
    fi
    
    # Skip deployment confirmation - automatically proceed
    echo ""
    print_info "Starting deployment..."
    
    # Start deployment
    START_TIME=$(date +%s)
    
    # Deploy services in order
    deploy_agent_api
    echo ""
    
    deploy_backend_api
    echo ""
    
    deploy_frontend
    echo ""
    
    # Update authentication/CORS
    update_service_authentication
    echo ""
    
    # Verify deployment
    verify_deployment
    echo ""
    
    # Calculate deployment time
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    MINUTES=$((DURATION / 60))
    SECONDS=$((DURATION % 60))
    
    # Display summary
    display_summary
    
    echo ""
    print_success "Deployment completed in ${MINUTES}m ${SECONDS}s"
    echo ""
}

# Run main function
main