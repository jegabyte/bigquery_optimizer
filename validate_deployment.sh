#!/bin/bash

# ================================================================
# BigQuery Optimizer - Deployment Validation Script
# ================================================================
# This script checks all prerequisites before deployment
# Usage: ./validate_deployment.sh
# ================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f ".env" ]; then
    echo "Loading environment from .env file..."
    source .env
fi

# Configuration
GCP_PROJECT_ID="${GCP_PROJECT_ID}"
BQ_PROJECT_ID="${BQ_PROJECT_ID:-$GCP_PROJECT_ID}"
BQ_DATASET="${BQ_DATASET:-bq_optimizer}"
BQ_LOCATION="${BQ_LOCATION:-US}"
REGION="${REGION:-us-central1}"
BACKEND_TYPE="${BACKEND_TYPE:-bigquery}"

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

check_pass() {
    ((TOTAL_CHECKS++))
    ((PASSED_CHECKS++))
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    ((TOTAL_CHECKS++))
    ((FAILED_CHECKS++))
    echo -e "${RED}❌ $1${NC}"
    if [ -n "$2" ]; then
        echo -e "   ${RED}Fix: $2${NC}"
    fi
}

check_warn() {
    ((TOTAL_CHECKS++))
    ((WARNINGS++))
    echo -e "${YELLOW}⚠️  $1${NC}"
    if [ -n "$2" ]; then
        echo -e "   ${YELLOW}Note: $2${NC}"
    fi
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ================================================================
# VALIDATION CHECKS
# ================================================================

print_header "DEPLOYMENT VALIDATION FOR BIGQUERY OPTIMIZER"
echo ""
echo "Project ID: ${GCP_PROJECT_ID:-NOT SET}"
echo "Backend Type: $BACKEND_TYPE"
echo "Region: $REGION"
echo "BigQuery Dataset: $BQ_DATASET"
echo ""

# ----------------------------------------------------------------
# 1. ENVIRONMENT VARIABLES
# ----------------------------------------------------------------
print_header "1. ENVIRONMENT VARIABLES"

if [ -z "$GCP_PROJECT_ID" ]; then
    check_fail "GCP_PROJECT_ID is not set" "export GCP_PROJECT_ID=your-project-id"
else
    check_pass "GCP_PROJECT_ID is set: $GCP_PROJECT_ID"
fi

if [ -z "$BQ_PROJECT_ID" ]; then
    check_warn "BQ_PROJECT_ID not set (will use GCP_PROJECT_ID)" 
else
    check_pass "BQ_PROJECT_ID is set: $BQ_PROJECT_ID"
fi

# ----------------------------------------------------------------
# 2. COMMAND LINE TOOLS
# ----------------------------------------------------------------
print_header "2. REQUIRED TOOLS"

# Check gcloud
if command -v gcloud &> /dev/null; then
    GCLOUD_VERSION=$(gcloud version --format="value(version.core)")
    check_pass "gcloud CLI installed (version: $GCLOUD_VERSION)"
    
    # Check if authenticated
    GCLOUD_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
    if [ -n "$GCLOUD_ACCOUNT" ]; then
        check_pass "gcloud authenticated as: $GCLOUD_ACCOUNT"
    else
        check_fail "gcloud not authenticated" "Run: gcloud auth login"
    fi
    
    # Check active project
    ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null)
    if [ "$ACTIVE_PROJECT" = "$GCP_PROJECT_ID" ]; then
        check_pass "gcloud project correctly set to: $ACTIVE_PROJECT"
    else
        check_warn "gcloud project is '$ACTIVE_PROJECT', expected '$GCP_PROJECT_ID'" "Run: gcloud config set project $GCP_PROJECT_ID"
    fi
else
    check_fail "gcloud CLI not installed" "Install from: https://cloud.google.com/sdk/docs/install"
fi

# Check Python
PYTHON_FOUND=false
for PYTHON_VERSION in python3.12 python3.11 python3.10 python3; do
    if command -v $PYTHON_VERSION &> /dev/null; then
        PY_VER=$($PYTHON_VERSION --version 2>&1 | cut -d' ' -f2)
        check_pass "Python installed: $PY_VER"
        PYTHON_FOUND=true
        break
    fi
done
if [ "$PYTHON_FOUND" = false ]; then
    check_fail "Python 3.10+ not found" "Install Python 3.10 or higher"
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js installed: $NODE_VERSION"
else
    check_fail "Node.js not installed" "Install from: https://nodejs.org/"
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    check_pass "npm installed: $NPM_VERSION"
else
    check_fail "npm not installed" "Install Node.js which includes npm"
fi

# Check ADK (for Agent API)
if command -v adk &> /dev/null; then
    check_pass "Google ADK installed"
elif [ -f "agent_api/.venv/bin/adk" ]; then
    check_pass "Google ADK found in agent_api virtual environment"
else
    check_warn "Google ADK not installed globally" "Install with: pip install google-adk"
fi

# ----------------------------------------------------------------
# 3. GCP APIS
# ----------------------------------------------------------------
print_header "3. GOOGLE CLOUD APIs"

if [ -n "$GCP_PROJECT_ID" ] && command -v gcloud &> /dev/null; then
    # Required APIs
    REQUIRED_APIS=(
        "bigquery.googleapis.com"
        "run.googleapis.com"
        "cloudbuild.googleapis.com"
        "artifactregistry.googleapis.com"
        "compute.googleapis.com"
    )
    
    if [ "$BACKEND_TYPE" = "firestore" ]; then
        REQUIRED_APIS+=("firestore.googleapis.com")
    fi
    
    # Get list of enabled APIs
    ENABLED_APIS=$(gcloud services list --enabled --project=$GCP_PROJECT_ID --format="value(config.name)" 2>/dev/null || echo "")
    
    if [ -n "$ENABLED_APIS" ]; then
        for API in "${REQUIRED_APIS[@]}"; do
            if echo "$ENABLED_APIS" | grep -q "$API"; then
                check_pass "$API is enabled"
            else
                check_fail "$API is NOT enabled" "Run: gcloud services enable $API --project=$GCP_PROJECT_ID"
            fi
        done
    else
        check_fail "Could not retrieve enabled APIs" "Check project permissions"
    fi
else
    check_warn "Skipping API checks (gcloud not available or project not set)"
fi

# ----------------------------------------------------------------
# 4. GCP PERMISSIONS
# ----------------------------------------------------------------
print_header "4. IAM PERMISSIONS"

if [ -n "$GCP_PROJECT_ID" ] && [ -n "$GCLOUD_ACCOUNT" ] && command -v gcloud &> /dev/null; then
    # Check IAM roles
    USER_ROLES=$(gcloud projects get-iam-policy $GCP_PROJECT_ID --flatten="bindings[].members" --filter="bindings.members:$GCLOUD_ACCOUNT" --format="value(bindings.role)" 2>/dev/null || echo "")
    
    if [ -n "$USER_ROLES" ]; then
        # Required roles (at least one of these)
        REQUIRED_ROLES=(
            "roles/owner"
            "roles/editor"
        )
        
        # Check for sufficient permissions
        HAS_PERMISSION=false
        for ROLE in "${REQUIRED_ROLES[@]}"; do
            if echo "$USER_ROLES" | grep -q "$ROLE"; then
                HAS_PERMISSION=true
                check_pass "Has $ROLE permission"
                break
            fi
        done
        
        if [ "$HAS_PERMISSION" = false ]; then
            # Check for specific roles
            SPECIFIC_ROLES=(
                "roles/bigquery.admin"
                "roles/run.admin"
                "roles/cloudbuild.builds.editor"
            )
            
            ALL_SPECIFIC=true
            for ROLE in "${SPECIFIC_ROLES[@]}"; do
                if ! echo "$USER_ROLES" | grep -q "$ROLE"; then
                    ALL_SPECIFIC=false
                fi
            done
            
            if [ "$ALL_SPECIFIC" = true ]; then
                check_pass "Has all required specific roles"
            else
                check_warn "Limited permissions detected" "Ensure you have BigQuery, Cloud Run, and Cloud Build permissions"
            fi
        fi
    else
        check_warn "Could not check IAM roles" "Ensure you have proper project permissions"
    fi
else
    check_warn "Skipping permission checks"
fi

# ----------------------------------------------------------------
# 5. BIGQUERY SETUP (if using BigQuery backend)
# ----------------------------------------------------------------
if [ "$BACKEND_TYPE" = "bigquery" ]; then
    print_header "5. BIGQUERY CONFIGURATION"
    
    if [ -n "$BQ_PROJECT_ID" ] && command -v gcloud &> /dev/null; then
        # Check if dataset exists
        DATASET_EXISTS=$(bq ls -d --project_id=$BQ_PROJECT_ID 2>/dev/null | grep -w "$BQ_DATASET" || echo "")
        
        if [ -n "$DATASET_EXISTS" ]; then
            check_pass "BigQuery dataset '$BQ_DATASET' exists"
            
            # Check tables in dataset
            TABLES=$(bq ls --project_id=$BQ_PROJECT_ID $BQ_DATASET 2>/dev/null | tail -n +3 | wc -l || echo "0")
            if [ "$TABLES" -gt 0 ]; then
                check_pass "Dataset contains $TABLES table(s)"
            else
                check_warn "Dataset is empty" "Tables will be created on first use"
            fi
        else
            check_warn "BigQuery dataset '$BQ_DATASET' does not exist" "Will be created during deployment"
        fi
        
        # Check INFORMATION_SCHEMA access
        TEST_QUERY="SELECT 1 FROM \`$BQ_PROJECT_ID\`.region-us.INFORMATION_SCHEMA.TABLES LIMIT 1"
        if bq query --use_legacy_sql=false "$TEST_QUERY" &>/dev/null; then
            check_pass "INFORMATION_SCHEMA access verified"
        else
            check_warn "Cannot access INFORMATION_SCHEMA" "Required for table analysis features"
        fi
    else
        check_warn "Skipping BigQuery checks"
    fi
fi

# ----------------------------------------------------------------
# 6. FIRESTORE SETUP (if using Firestore backend)
# ----------------------------------------------------------------
if [ "$BACKEND_TYPE" = "firestore" ]; then
    print_header "6. FIRESTORE CONFIGURATION"
    
    if [ -n "$GCP_PROJECT_ID" ] && command -v gcloud &> /dev/null; then
        # Check if Firestore is initialized
        FIRESTORE_DB=$(gcloud firestore databases list --project=$GCP_PROJECT_ID --format="value(name)" 2>/dev/null | head -1 || echo "")
        
        if [ -n "$FIRESTORE_DB" ]; then
            check_pass "Firestore database exists: $FIRESTORE_DB"
        else
            check_warn "Firestore not initialized" "Run: gcloud firestore databases create --location=$REGION --project=$GCP_PROJECT_ID"
        fi
    else
        check_warn "Skipping Firestore checks"
    fi
fi

# ----------------------------------------------------------------
# 7. LOCAL DEPENDENCIES
# ----------------------------------------------------------------
print_header "7. LOCAL DEPENDENCIES"

# Check agent_api dependencies
if [ -d "agent_api" ]; then
    if [ -f "agent_api/requirements.txt" ]; then
        check_pass "agent_api/requirements.txt exists"
    else
        check_fail "agent_api/requirements.txt missing"
    fi
    
    if [ -d "agent_api/.venv" ]; then
        check_pass "agent_api virtual environment exists"
    else
        check_warn "agent_api virtual environment not created" "Will be created during deployment"
    fi
else
    check_fail "agent_api directory not found"
fi

# Check backend_api dependencies
if [ -d "backend_api" ]; then
    if [ -f "backend_api/requirements.txt" ]; then
        check_pass "backend_api/requirements.txt exists"
    else
        check_fail "backend_api/requirements.txt missing"
    fi
    
    if [ -d "backend_api/.venv" ] || [ -d "backend_api/venv" ]; then
        check_pass "backend_api virtual environment exists"
    else
        check_warn "backend_api virtual environment not created" "Will be created during deployment"
    fi
else
    check_fail "backend_api directory not found"
fi

# Check frontend dependencies
if [ -d "frontend" ]; then
    if [ -f "frontend/package.json" ]; then
        check_pass "frontend/package.json exists"
    else
        check_fail "frontend/package.json missing"
    fi
    
    if [ -d "frontend/node_modules" ]; then
        check_pass "frontend node_modules installed"
    else
        check_warn "frontend node_modules not installed" "Will be installed during deployment"
    fi
else
    check_fail "frontend directory not found"
fi

# ----------------------------------------------------------------
# 8. NETWORK & SECURITY
# ----------------------------------------------------------------
print_header "8. NETWORK & SECURITY"

# Check if default service account exists
if [ -n "$GCP_PROJECT_ID" ] && command -v gcloud &> /dev/null; then
    DEFAULT_SA="${GCP_PROJECT_ID}@appspot.gserviceaccount.com"
    SA_EXISTS=$(gcloud iam service-accounts describe $DEFAULT_SA --project=$GCP_PROJECT_ID 2>/dev/null || echo "")
    
    if [ -n "$SA_EXISTS" ]; then
        check_pass "Default App Engine service account exists"
    else
        check_warn "Default service account not found" "Cloud Run will use Compute Engine default service account"
    fi
fi

# Check if billing is enabled
if [ -n "$GCP_PROJECT_ID" ] && command -v gcloud &> /dev/null; then
    BILLING_ENABLED=$(gcloud beta billing projects describe $GCP_PROJECT_ID --format="value(billingEnabled)" 2>/dev/null || echo "")
    
    if [ "$BILLING_ENABLED" = "True" ]; then
        check_pass "Billing is enabled for the project"
    else
        check_fail "Billing is not enabled" "Link a billing account to your project"
    fi
fi

# ================================================================
# SUMMARY
# ================================================================
print_header "VALIDATION SUMMARY"

echo ""
echo -e "${BLUE}Total Checks:${NC} $TOTAL_CHECKS"
echo -e "${GREEN}Passed:${NC} $PASSED_CHECKS"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "${RED}Failed:${NC} $FAILED_CHECKS"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}🎉 ALL CHECKS PASSED! Ready for deployment.${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS${NC}"
        echo -e "${YELLOW}The deployment should work, but review the warnings above.${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi
    echo ""
    echo "Next steps:"
    echo "  1. For local development: ./deploy.sh local"
    echo "  2. For cloud deployment: ./deploy.sh remote"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ VALIDATION FAILED${NC}"
    echo -e "${RED}Please fix the issues above before deploying.${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi