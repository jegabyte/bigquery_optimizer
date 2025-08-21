#!/bin/bash

# ================================================================
# BigQuery Optimizer - IAP Setup Script
# ================================================================
# This script configures Identity-Aware Proxy for the frontend
# ================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Set defaults
GCP_PROJECT_ID="${GCP_PROJECT_ID}"
REGION="${REGION:-us-central1}"
FRONTEND_SERVICE="bigquery-optimizer-frontend"
BACKEND_SERVICE="bigquery-optimizer-backend-api"
AGENT_SERVICE="bigquery-optimizer-agent-api"

echo -e "${GREEN}=== Setting up IAP for BigQuery Optimizer ===${NC}"
echo "Project: $GCP_PROJECT_ID"
echo "Region: $REGION"

# Step 1: Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable iap.googleapis.com \
    cloudresourcemanager.googleapis.com \
    iamcredentials.googleapis.com \
    --project=$GCP_PROJECT_ID

# Step 2: Get Cloud Run service URL
echo -e "${YELLOW}Getting Cloud Run service URLs...${NC}"
FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE \
    --region=$REGION \
    --project=$GCP_PROJECT_ID \
    --format='value(status.url)' 2>/dev/null || echo "")

if [ -z "$FRONTEND_URL" ]; then
    echo -e "${RED}Frontend service not deployed. Deploy it first with: ./deploy.sh remote-frontend${NC}"
    exit 1
fi

echo "Frontend URL: $FRONTEND_URL"

# Step 3: Create Backend Config for IAP
echo -e "${YELLOW}Creating backend configuration for IAP...${NC}"
cat > iap-backend-config.yaml <<EOF
swagger: '2.0'
info:
  title: BigQuery Optimizer API
  version: 1.0.0
host: $(echo $FRONTEND_URL | sed 's|https://||')
schemes:
- https
produces:
- application/json
paths:
  "/**":
    get:
      operationId: "corsGET"
      responses:
        '200':
          description: "Success"
    post:
      operationId: "corsPOST"
      responses:
        '200':
          description: "Success"
    options:
      operationId: "corsOPTIONS"
      responses:
        '200':
          description: "Success"
EOF

# Step 4: Configure IAP for services
echo -e "${YELLOW}Configuring IAP for Cloud Run services...${NC}"

# Allow unauthenticated for backend APIs (they handle auth internally)
gcloud run services add-iam-policy-binding $BACKEND_SERVICE \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region=$REGION \
    --project=$GCP_PROJECT_ID

gcloud run services add-iam-policy-binding $AGENT_SERVICE \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region=$REGION \
    --project=$GCP_PROJECT_ID

# Step 5: Create OAuth consent screen instructions
echo -e "${GREEN}=== Manual Steps Required ===${NC}"
echo ""
echo "1. Configure OAuth Consent Screen:"
echo "   - Go to: https://console.cloud.google.com/apis/credentials/consent?project=$GCP_PROJECT_ID"
echo "   - Choose 'Internal' for organization users or 'External' for public"
echo "   - Fill in:"
echo "     * App name: BigQuery Optimizer"
echo "     * User support email: your-email@domain.com"
echo "     * Authorized domains: $(echo $FRONTEND_URL | sed 's|https://||' | sed 's|/.*||')"
echo "   - Add scopes: email, profile, openid"
echo ""
echo "2. Create OAuth 2.0 Client ID:"
echo "   - Go to: https://console.cloud.google.com/apis/credentials?project=$GCP_PROJECT_ID"
echo "   - Click 'CREATE CREDENTIALS' > 'OAuth client ID'"
echo "   - Application type: Web application"
echo "   - Name: BigQuery Optimizer IAP"
echo "   - Authorized redirect URIs:"
echo "     * ${FRONTEND_URL}/_gcp_gatekeeper/authenticate"
echo "   - Copy the Client ID after creation"
echo ""
echo "3. Enable IAP:"
echo "   - Go to: https://console.cloud.google.com/security/iap?project=$GCP_PROJECT_ID"
echo "   - Find your Cloud Run service: $FRONTEND_SERVICE"
echo "   - Toggle IAP to 'ON'"
echo "   - Configure access by adding users/groups"
echo ""
echo "4. Update environment variables:"
echo "   Add to your .env file:"
echo "   IAP_AUDIENCE=<OAuth_Client_ID_from_step_2>"
echo "   IAP_ENABLED=true"
echo ""
echo "5. Redeploy services with IAP support:"
echo "   source .env"
echo "   ./deploy.sh remote"
echo ""
echo -e "${GREEN}=== IAP Setup Instructions Complete ===${NC}"

# Step 6: Create test script
cat > test-iap.sh <<'EOF'
#!/bin/bash
# Test IAP authentication

FRONTEND_URL="$1"
if [ -z "$FRONTEND_URL" ]; then
    echo "Usage: ./test-iap.sh <frontend-url>"
    exit 1
fi

echo "Testing IAP authentication..."
echo "1. Opening browser to: $FRONTEND_URL"
echo "2. You should be redirected to Google login"
echo "3. After login, you'll access the app"

# Open in browser
if command -v open &> /dev/null; then
    open "$FRONTEND_URL"
elif command -v xdg-open &> /dev/null; then
    xdg-open "$FRONTEND_URL"
else
    echo "Please open in browser: $FRONTEND_URL"
fi
EOF

chmod +x test-iap.sh

echo -e "${GREEN}Test script created: ./test-iap.sh${NC}"
echo "Run: ./test-iap.sh $FRONTEND_URL"