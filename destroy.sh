#!/bin/bash

###################################################################################
# BigQuery Optimizer - Cloud Run Cleanup Script
###################################################################################
# This script removes all resources created by the deploy.sh script
# It will delete:
# - Cloud Run services (frontend and backend)
# - Artifact Registry images and repository
# - Service account and IAM bindings
# - Any created buckets or temporary resources
#
# WARNING: This will permanently delete resources. Use with caution!
###################################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration Variables - Must match deploy.sh
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME_BACKEND="${SERVICE_NAME_BACKEND:-bigquery-optimizer-backend}"
SERVICE_NAME_FRONTEND="${SERVICE_NAME_FRONTEND:-bigquery-optimizer-frontend}"
APP_NAME="${APP_NAME:-bigquery-optimizer}"
ARTIFACT_REGISTRY_REPO="${ARTIFACT_REGISTRY_REPO:-bigquery-optimizer}"

# Print header
echo "=========================================="
echo "BigQuery Optimizer - Resource Cleanup"
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

# Function to confirm destruction
confirm_destruction() {
    print_warning "This will permanently delete all BigQuery Optimizer resources!"
    echo ""
    echo "Resources to be deleted:"
    echo "  - Cloud Run service: $SERVICE_NAME_BACKEND"
    echo "  - Cloud Run service: $SERVICE_NAME_FRONTEND"
    echo "  - Artifact Registry repository: $ARTIFACT_REGISTRY_REPO"
    echo "  - Service account: ${APP_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
    echo "  - All associated Docker images"
    echo ""
    
    read -p "Are you sure you want to continue? Type 'yes' to confirm: " CONFIRMATION
    
    if [ "$CONFIRMATION" != "yes" ]; then
        print_info "Cleanup cancelled"
        exit 0
    fi
}

# Function to validate project configuration
validate_project() {
    print_info "Validating project configuration..."
    
    # Get or prompt for project ID
    if [ -z "$PROJECT_ID" ]; then
        read -p "Enter your Google Cloud Project ID: " PROJECT_ID
    fi
    
    # Verify gcloud is configured for the correct project
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        print_info "Setting project to $PROJECT_ID..."
        gcloud config set project $PROJECT_ID
    fi
    
    print_success "Project validated: $PROJECT_ID"
}

# Function to delete Cloud Run services
delete_cloud_run_services() {
    print_info "Deleting Cloud Run services..."
    
    # Delete backend service
    if gcloud run services describe $SERVICE_NAME_BACKEND \
        --region=$REGION &> /dev/null; then
        print_info "Deleting backend service: $SERVICE_NAME_BACKEND..."
        gcloud run services delete $SERVICE_NAME_BACKEND \
            --region=$REGION \
            --quiet
        print_success "Backend service deleted"
    else
        print_info "Backend service not found: $SERVICE_NAME_BACKEND"
    fi
    
    # Delete frontend service
    if gcloud run services describe $SERVICE_NAME_FRONTEND \
        --region=$REGION &> /dev/null; then
        print_info "Deleting frontend service: $SERVICE_NAME_FRONTEND..."
        gcloud run services delete $SERVICE_NAME_FRONTEND \
            --region=$REGION \
            --quiet
        print_success "Frontend service deleted"
    else
        print_info "Frontend service not found: $SERVICE_NAME_FRONTEND"
    fi
}

# Function to delete Artifact Registry resources
delete_artifact_registry() {
    print_info "Deleting Artifact Registry resources..."
    
    # Check if repository exists
    if gcloud artifacts repositories describe $ARTIFACT_REGISTRY_REPO \
        --location=$REGION &> /dev/null; then
        
        # List all images in the repository
        print_info "Listing images in repository..."
        IMAGES=$(gcloud artifacts docker images list \
            ${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REGISTRY_REPO} \
            --format="value(IMAGE)" 2>/dev/null || true)
        
        if [ ! -z "$IMAGES" ]; then
            print_info "Deleting Docker images..."
            while IFS= read -r IMAGE; do
                if [ ! -z "$IMAGE" ]; then
                    print_info "Deleting image: $IMAGE"
                    gcloud artifacts docker images delete "$IMAGE" \
                        --quiet --delete-tags &> /dev/null || true
                fi
            done <<< "$IMAGES"
        fi
        
        # Delete the repository
        print_info "Deleting Artifact Registry repository: $ARTIFACT_REGISTRY_REPO..."
        gcloud artifacts repositories delete $ARTIFACT_REGISTRY_REPO \
            --location=$REGION \
            --quiet
        print_success "Artifact Registry repository deleted"
    else
        print_info "Artifact Registry repository not found: $ARTIFACT_REGISTRY_REPO"
    fi
}

# Function to delete service account and IAM bindings
delete_service_account() {
    print_info "Deleting service account and IAM bindings..."
    
    SERVICE_ACCOUNT="${APP_NAME}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Check if service account exists
    if gcloud iam service-accounts describe $SERVICE_ACCOUNT &> /dev/null; then
        
        # Remove IAM policy bindings
        print_info "Removing IAM policy bindings..."
        
        # Remove BigQuery roles
        gcloud projects remove-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SERVICE_ACCOUNT" \
            --role="roles/bigquery.dataViewer" \
            --quiet &> /dev/null || true
        
        gcloud projects remove-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SERVICE_ACCOUNT" \
            --role="roles/bigquery.jobUser" \
            --quiet &> /dev/null || true
        
        # Remove Vertex AI roles
        gcloud projects remove-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SERVICE_ACCOUNT" \
            --role="roles/aiplatform.user" \
            --quiet &> /dev/null || true
        
        # Remove Cloud Trace roles
        gcloud projects remove-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SERVICE_ACCOUNT" \
            --role="roles/cloudtrace.agent" \
            --quiet &> /dev/null || true
        
        # Delete the service account
        print_info "Deleting service account: $SERVICE_ACCOUNT..."
        gcloud iam service-accounts delete $SERVICE_ACCOUNT \
            --quiet
        print_success "Service account deleted"
    else
        print_info "Service account not found: $SERVICE_ACCOUNT"
    fi
}

# Function to delete staging buckets
delete_staging_buckets() {
    print_info "Checking for staging buckets..."
    
    # Check for ADK staging bucket
    STAGING_BUCKET="gs://${PROJECT_ID}-adk-bigquery-optimizer-staging"
    
    if gsutil ls $STAGING_BUCKET &> /dev/null; then
        print_info "Deleting staging bucket: $STAGING_BUCKET..."
        gsutil -m rm -r $STAGING_BUCKET
        print_success "Staging bucket deleted"
    else
        print_info "Staging bucket not found"
    fi
}

# Function to clean up local artifacts
cleanup_local() {
    print_info "Cleaning up local artifacts..."
    
    # Remove any generated files from deploy script
    if [ -f "backend/main.py" ]; then
        rm -f backend/main.py
        print_info "Removed backend/main.py"
    fi
    
    if [ -f "backend/Dockerfile" ]; then
        rm -f backend/Dockerfile
        print_info "Removed backend/Dockerfile"
    fi
    
    if [ -f "frontend/nginx.conf" ]; then
        rm -f frontend/nginx.conf
        print_info "Removed frontend/nginx.conf"
    fi
    
    if [ -f "frontend/.env.production" ]; then
        rm -f frontend/.env.production
        print_info "Removed frontend/.env.production"
    fi
    
    print_success "Local cleanup complete"
}

# Function to display cleanup summary
display_summary() {
    echo ""
    echo "=========================================="
    echo "Cleanup Summary"
    echo "=========================================="
    echo ""
    echo -e "${GREEN}✓ Cleanup completed successfully!${NC}"
    echo ""
    echo "The following resources have been deleted:"
    echo "  - Cloud Run services"
    echo "  - Artifact Registry repository and images"
    echo "  - Service account and IAM bindings"
    echo "  - Staging buckets (if any)"
    echo "  - Local temporary files"
    echo ""
    echo "Project: $PROJECT_ID"
    echo "Region: $REGION"
    echo ""
    print_warning "Note: Cloud Logging entries and metrics may still be retained according to your retention policies."
    echo ""
}

# Function to handle errors
error_handler() {
    print_error "An error occurred during cleanup. Some resources may not have been deleted."
    print_info "Please check the Google Cloud Console to verify resource deletion."
    exit 1
}

# Set error handler
trap error_handler ERR

# Main cleanup flow
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
            --force)
                FORCE_DELETE=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --project PROJECT_ID    Google Cloud project ID"
                echo "  --region REGION        Deployment region (default: us-central1)"
                echo "  --force                Skip confirmation prompt"
                echo "  --help                 Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate project
    validate_project
    
    # Confirm destruction unless --force is used
    if [ "$FORCE_DELETE" != "true" ]; then
        confirm_destruction
    fi
    
    # Run cleanup steps
    print_info "Starting resource cleanup..."
    
    delete_cloud_run_services
    delete_artifact_registry
    delete_service_account
    delete_staging_buckets
    cleanup_local
    
    display_summary
}

# Run main function
main "$@"