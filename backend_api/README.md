# BigQuery API Backend

Separate FastAPI backend for handling BigQuery operations for the Projects & Jobs feature.

## Setup

1. Run the setup script:
```bash
chmod +x setup.sh
./setup.sh
```

2. Set up BigQuery credentials:
   - Option 1: Place your service account JSON file as `service-account.json` in this directory
   - Option 2: Use Application Default Credentials (ADC) by running `gcloud auth application-default login`

3. Create the BigQuery dataset and tables:
```bash
# Run the schema creation script
bq mk --dataset --location=US aiva-e74f3:bq_optimizer
bq query --use_legacy_sql=false < ../backend/schemas/bq_optimizer_schema.sql
```

## Running Locally

1. Activate the virtual environment:
```bash
source venv/bin/activate
```

2. Start the server:
```bash
python main.py
```

The API will be available at:
- API endpoints: http://localhost:8001
- Interactive docs: http://localhost:8001/docs
- OpenAPI schema: http://localhost:8001/openapi.json

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
- `POST /api/projects/scan` - Scan a project for queries
- `GET /api/projects/{project_id}/templates` - Get templates for a project
- `POST /api/projects/{project_id}/refresh` - Refresh project data
- `DELETE /api/projects/{project_id}` - Delete a project

### Health
- `GET /health` - Health check endpoint

## Environment Variables

- `BQ_PROJECT_ID` - BigQuery project ID (default: aiva-e74f3)
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON (optional)

## Deployment

For deployment to Google Cloud Run:

```bash
# Build and push Docker image
docker build -t gcr.io/aiva-e74f3/bq-api .
docker push gcr.io/aiva-e74f3/bq-api

# Deploy to Cloud Run
gcloud run deploy bq-api \
  --image gcr.io/aiva-e74f3/bq-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars BQ_PROJECT_ID=aiva-e74f3
```

## Testing

Test the API using curl:

```bash
# Health check
curl http://localhost:8001/health

# Scan a project
curl -X POST "http://localhost:8001/api/projects/scan?project_id=aiva-e74f3&analysis_window=30"

# Get all projects
curl http://localhost:8001/api/projects
```