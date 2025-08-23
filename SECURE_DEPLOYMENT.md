# Secure Deployment Guide

## Overview
This guide explains how to deploy BigQuery Optimizer with proper security and authentication. The secure deployment ensures that:
- Backend and Agent APIs are **NOT publicly accessible**
- Only authorized service accounts can access the APIs
- Frontend uses a proxy with service account authentication
- Inter-service communication is secured

## Architecture

```
┌─────────────────┐
│    Frontend     │ ← App Engine (PUBLIC)
│  (React + Proxy)│   Uses service account internally
└────────┬────────┘
         │ 
    [Auth Proxy]
         │
    ┌────┴─────┐
    ▼          ▼
┌──────────┐  ┌──────────┐
│ Agent API│  │Backend API│ ← Cloud Run (PRIVATE)
│   (ADK)  │  │ (FastAPI) │   Require authentication
└──────────┘  └──────────┘
     🔒            🔒
  [Secured]    [Secured]
```

## Quick Deployment

### Deploy with Security
```bash
./deploy-production-secure.sh
```

### Deploy with Options
```bash
# With specific project
./deploy-production-secure.sh --project=my-project-id

# With BigQuery backend
./deploy-production-secure.sh --backend=bigquery
```

## Security Features

### 1. **Service Account Authentication**
- A dedicated service account (`bq-optimizer-sa`) is created
- Service account has minimal required permissions
- Used for all inter-service communication

### 2. **Private APIs**
- **Agent API**: Deployed with `--no-allow-unauthenticated`
- **Backend API**: Deployed with `--no-allow-unauthenticated`
- Direct browser access returns 403 Forbidden
- Only accessible via authenticated requests

### 3. **Frontend Auth Proxy**
The frontend includes an authentication proxy (`auth-proxy.js`) that:
- Serves the React application publicly
- Proxies API requests with authentication tokens
- Uses Google Auth Library to generate ID tokens
- Routes:
  - `/api/agent/*` → Agent API (with auth)
  - `/api/backend/*` → Backend API (with auth)

### 4. **CORS Configuration**
- APIs only accept requests from the frontend domain
- Localhost access blocked in production
- Cross-origin requests from other domains rejected

## Service Account Permissions

The service account is granted these IAM roles:
- `roles/run.invoker` - Invoke Cloud Run services
- `roles/bigquery.dataEditor` - BigQuery operations
- `roles/datastore.user` - Firestore operations
- `roles/storage.objectViewer` - Storage access

## How It Works

### 1. **Frontend Request Flow**
```
User Browser → Frontend (App Engine) → Auth Proxy → Cloud Run API
                                          ↓
                                    [Adds ID Token]
```

### 2. **Authentication Process**
1. User accesses frontend (public)
2. Frontend makes API request to `/api/agent/endpoint`
3. Auth proxy intercepts request
4. Proxy generates ID token using service account
5. Request forwarded to Cloud Run with auth token
6. Cloud Run validates token and processes request

### 3. **Token Generation**
```javascript
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth();
const client = await auth.getIdTokenClient(targetUrl);
const response = await client.request({ url, method, data });
```

## Deployment Steps

### Step 1: Create Service Account
```bash
gcloud iam service-accounts create bq-optimizer-sa \
    --display-name="BigQuery Optimizer Service Account"
```

### Step 2: Deploy APIs (Private)
```bash
# Agent API
gcloud run deploy agent-api \
    --no-allow-unauthenticated \
    --service-account=bq-optimizer-sa@PROJECT.iam.gserviceaccount.com

# Backend API  
gcloud run deploy backend-api \
    --no-allow-unauthenticated \
    --service-account=bq-optimizer-sa@PROJECT.iam.gserviceaccount.com
```

### Step 3: Grant Invoker Permission
```bash
gcloud run services add-iam-policy-binding SERVICE_NAME \
    --member="serviceAccount:SA_EMAIL" \
    --role="roles/run.invoker"
```

### Step 4: Deploy Frontend with Proxy
The frontend includes `auth-proxy.js` that handles authentication automatically.

## Testing Security

### Verify APIs are Secured
```bash
# Should return 403 Forbidden
curl https://agent-api-url.run.app/health
curl https://backend-api-url.run.app/health

# Frontend should be accessible
curl https://frontend.appspot.com
```

### Test with Authentication
```bash
# Get ID token
TOKEN=$(gcloud auth print-identity-token)

# Test with token (should work)
curl -H "Authorization: Bearer $TOKEN" https://api-url.run.app/health
```

## Configuration Files

### Frontend `auth-proxy.js`
- Handles authentication for API requests
- Serves static React files
- Routes API calls with ID tokens

### Frontend `app.yaml`
```yaml
env_variables:
  SERVICE_ACCOUNT_EMAIL: 'sa@project.iam.gserviceaccount.com'
  AGENT_API_URL: 'https://agent-api.run.app'
  BACKEND_API_URL: 'https://backend-api.run.app'
```

## Troubleshooting

### Issue: 403 Forbidden on API
**Solution**: This is expected! APIs should not be directly accessible.

### Issue: Frontend can't reach APIs
**Check**:
1. Service account has `roles/run.invoker`
2. Environment variables are set correctly
3. Auth proxy is running (`node auth-proxy.js`)

### Issue: CORS errors
**Check**:
1. CORS_ORIGINS environment variable includes frontend URL
2. Frontend is using proxy paths (`/api/agent`, `/api/backend`)

## Security Best Practices

### 1. **Principle of Least Privilege**
- Service account only has necessary permissions
- No admin or owner roles

### 2. **Defense in Depth**
- Multiple layers of security
- Authentication + CORS + Network policies

### 3. **Audit Logging**
- All API access is logged
- Service account actions are auditable

### 4. **Key Rotation**
- Rotate service account keys periodically
- Use key expiration policies

### 5. **Environment Isolation**
- Separate service accounts for dev/staging/prod
- Different projects for different environments

## Migration from Public to Secure

To migrate existing public deployment:

1. **Create service account**
   ```bash
   ./deploy-production-secure.sh --project=PROJECT_ID
   ```

2. **Update existing services**
   ```bash
   # Make APIs private
   gcloud run services update agent-api --no-allow-unauthenticated
   gcloud run services update backend-api --no-allow-unauthenticated
   ```

3. **Redeploy frontend**
   The secure script handles frontend proxy setup automatically

## Monitoring

### View Logs
```bash
# Frontend logs (includes proxy)
gcloud app logs tail

# API logs (will show auth attempts)
gcloud logging read "resource.type=cloud_run_revision"
```

### Check Authentication
```bash
# List IAM bindings
gcloud run services get-iam-policy SERVICE_NAME
```

### Monitor Service Account Usage
```bash
# View service account activity
gcloud logging read "protoPayload.authenticationInfo.principalEmail=SA_EMAIL"
```

## Cost Implications

- **No additional cost** for authentication
- Service account usage is free
- Same Cloud Run and App Engine pricing
- Potential slight latency for token generation

## Rollback to Public Access

If needed to temporarily make APIs public:
```bash
# WARNING: Not recommended for production
gcloud run services update SERVICE --allow-unauthenticated
```

## Next Steps

1. **Enable VPC Service Controls** for additional network security
2. **Implement API Keys** for rate limiting
3. **Add Cloud Armor** for DDoS protection
4. **Set up Identity-Aware Proxy (IAP)** for user authentication
5. **Configure Secret Manager** for sensitive data
6. **Enable Binary Authorization** for container security
7. **Implement Cloud KMS** for encryption keys