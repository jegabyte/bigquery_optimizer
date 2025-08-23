#!/bin/bash

# BigQuery Optimizer Frontend App Engine Deployment Script

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Deploying BigQuery Optimizer Frontend to App Engine..."
echo "================================================"

# Configuration
PROJECT_ID="aiva-e74f3"
REGION="us-central1"
SERVICE_NAME="default"
BACKEND_URL="https://bigquery-optimizer-backend-puql6kbaxq-uc.a.run.app"
AGENT_API_URL="https://bigquery-optimizer-agent-api-puql6kbaxq-uc.a.run.app"

# Function to print colored messages
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Prerequisites Check
echo ""
echo "📋 Checking prerequisites..."
echo "--------------------------------"

# 1. Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed!"
    echo "   Please install Google Cloud SDK from: https://cloud.google.com/sdk/docs/install"
    exit 1
else
    print_success "gcloud CLI found"
fi

# 2. Check if authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    print_error "Not authenticated with gcloud!"
    echo "   Run: gcloud auth login"
    exit 1
else
    ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
    print_success "Authenticated as: $ACTIVE_ACCOUNT"
fi

# 3. Check if project exists and is accessible
if ! gcloud projects describe $PROJECT_ID &> /dev/null; then
    print_error "Cannot access project: $PROJECT_ID"
    echo "   Ensure you have access to the project or update PROJECT_ID in this script"
    echo "   Run: gcloud projects list"
    exit 1
else
    print_success "Project accessible: $PROJECT_ID"
fi

# 4. Set the project
gcloud config set project $PROJECT_ID --quiet
print_success "Project set to: $PROJECT_ID"

# 5. Check if App Engine APIs are enabled
echo ""
echo "🔧 Checking Google Cloud APIs..."
REQUIRED_APIS=("appengine.googleapis.com" "cloudbuild.googleapis.com")

for API in "${REQUIRED_APIS[@]}"; do
    if gcloud services list --enabled --filter="name:$API" --format="value(name)" --project=$PROJECT_ID | grep -q $API; then
        print_success "API enabled: $API"
    else
        print_warning "Enabling API: $API"
        gcloud services enable $API --project=$PROJECT_ID
        if [ $? -eq 0 ]; then
            print_success "API enabled: $API"
        else
            print_error "Failed to enable API: $API"
            echo "   Run manually: gcloud services enable $API --project=$PROJECT_ID"
            exit 1
        fi
    fi
done

# 6. Check if App Engine is initialized
echo ""
echo "🌍 Checking App Engine initialization..."
if ! gcloud app describe --project=$PROJECT_ID &> /dev/null; then
    print_warning "App Engine not initialized for project $PROJECT_ID"
    echo ""
    echo "App Engine needs to be initialized with a region."
    echo "Available regions:"
    echo "  - us-central (Iowa)"
    echo "  - us-east1 (South Carolina)"
    echo "  - us-east4 (Northern Virginia)"
    echo "  - europe-west (Belgium)"
    echo "  - europe-west2 (London)"
    echo "  - asia-northeast1 (Tokyo)"
    echo ""
    read -p "Enter your preferred region (e.g., us-central): " APP_REGION
    
    echo "Initializing App Engine in region: $APP_REGION"
    gcloud app create --region=$APP_REGION --project=$PROJECT_ID
    
    if [ $? -ne 0 ]; then
        print_error "Failed to initialize App Engine"
        echo "   Run manually: gcloud app create --region=YOUR_REGION --project=$PROJECT_ID"
        exit 1
    fi
    print_success "App Engine initialized in region: $APP_REGION"
else
    APP_REGION=$(gcloud app describe --project=$PROJECT_ID --format="value(locationId)")
    print_success "App Engine already initialized in region: $APP_REGION"
fi

# 7. Check if Node.js is installed
echo ""
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    echo "   Please install Node.js 18+ from: https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
fi

# 8. Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed!"
    echo "   Please install npm (comes with Node.js)"
    exit 1
else
    NPM_VERSION=$(npm --version)
    print_success "npm found: $NPM_VERSION"
fi

# 9. Check required files
echo ""
echo "📁 Checking required files..."
REQUIRED_FILES=("package.json" "app.yaml" "server.js")

for FILE in "${REQUIRED_FILES[@]}"; do
    if [ -f "$FILE" ]; then
        print_success "Found: $FILE"
    else
        print_error "Missing required file: $FILE"
        echo "   Ensure you're running this script from the frontend directory"
        exit 1
    fi
done

# 10. Check if dist directory will be created
if [ ! -d "src" ]; then
    print_error "src directory not found!"
    echo "   Ensure you're in the correct frontend directory"
    exit 1
fi

echo ""
echo "================================================"
echo "📋 All prerequisites checked!"
echo "================================================"
echo ""
echo "📦 Deployment Configuration:"
echo "  Project: $PROJECT_ID"
echo "  Region: $APP_REGION"
echo "  Service: $SERVICE_NAME (App Engine default service)"
echo "  Backend URL: $BACKEND_URL"
echo "  Agent API URL: $AGENT_API_URL"
echo ""

# Confirm deployment
read -p "Do you want to proceed with deployment? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Build Process
echo ""
echo "🔨 Building frontend assets..."

# Set environment variables for build
export VITE_API_URL=$AGENT_API_URL
export VITE_BACKEND_API_URL=$BACKEND_URL
export VITE_BQ_API_URL=$BACKEND_URL
export VITE_GCP_PROJECT_ID=$PROJECT_ID

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi

# Build the app
echo "🏗️  Building production bundle..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Build failed"
    exit 1
fi

# Check if build output exists
if [ ! -d "dist" ]; then
    print_error "Build directory 'dist' not found after build"
    exit 1
fi

print_success "Build completed successfully"

# Deploy to App Engine
echo ""
echo "☁️  Deploying to App Engine..."
echo "This may take a few minutes..."

gcloud app deploy app.yaml \
  --project=$PROJECT_ID \
  --quiet \
  --version=production \
  --promote

if [ $? -ne 0 ]; then
    print_error "Deployment failed"
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Check your internet connection"
    echo "  2. Ensure you have proper permissions in the project"
    echo "  3. Check if billing is enabled for the project"
    echo "  4. Review the error message above"
    echo ""
    echo "For more help, check the logs:"
    echo "  gcloud app logs read"
    exit 1
fi

# Deployment Success
echo ""
echo "================================================"
print_success "Deployment completed successfully!"
echo "================================================"
echo ""

# App Engine URL format
if [ "$SERVICE_NAME" == "default" ]; then
  SERVICE_URL="https://$PROJECT_ID.$APP_REGION.r.appspot.com"
else
  SERVICE_URL="https://$SERVICE_NAME-dot-$PROJECT_ID.$APP_REGION.r.appspot.com"
fi

echo "🌐 Frontend URL: $SERVICE_URL"
echo "🔗 Backend URL: $BACKEND_URL"
echo "🤖 Agent API URL: $AGENT_API_URL"
echo ""
echo "📊 Useful commands:"
echo "  View logs:        gcloud app logs tail"
echo "  Open in browser:  gcloud app browse"
echo "  Check versions:   gcloud app versions list"
echo "  Check services:   gcloud app services list"
echo ""
echo "Your BigQuery Optimizer is now live at:"
echo "  $SERVICE_URL"
echo ""