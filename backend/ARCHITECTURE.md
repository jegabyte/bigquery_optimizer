# BigQuery Optimizer Backend Architecture

## Overview
The BigQuery Optimizer uses Google's ADK (Agent Development Kit) with Vertex AI to analyze and optimize BigQuery SQL queries through a multi-agent pipeline.

## Technology Stack
- **Framework**: Google ADK (Agent Development Kit)
- **LLM Model**: Gemini 2.5 Flash (via Vertex AI)
- **Backend**: FastAPI with ADK API Server
- **Streaming**: Server-Sent Events (SSE)
- **BigQuery Integration**: Google Cloud BigQuery Python Client

## Agent Pipeline Architecture

### Main Entry Point
- **File**: `app/streaming_agent.py`
- **Root Agent**: `streaming_orchestrator`
- **Pipeline Type**: Sequential with streaming callbacks

### Agent Flow

```
User Query
    ↓
streaming_orchestrator (Gemini 2.5 Flash)
    ↓
streaming_pipeline (SequentialAgent)
    ├── 1. metadata_extractor
    ├── 2. rule_checker  
    ├── 3. query_optimizer
    └── 4. final_reporter
```

## Detailed Agent Descriptions

### 1. Metadata Extractor Agent
**Model**: Gemini 2.5 Flash  
**Purpose**: Extracts and analyzes table metadata from BigQuery  
**Tool**: `fetch_bigquery_metadata` (ACTUAL BigQuery API calls)  
**Output Format**:
```json
{
    "tables_found": <number>,
    "total_size_gb": <number>,
    "total_row_count": <number>,
    "tables": [
        {
            "table_name": "<table path>",
            "size_gb": <number>,
            "row_count": <number>,
            "column_names": ["col1", "col2", ...],
            "partitioned": true/false,
            "partition_field": "<field>" or null,
            "clustered": true/false,
            "cluster_fields": ["field1", "field2"] or []
        }
    ]
}
```

**Prompt**: 
- Calls `fetch_bigquery_metadata` tool with the SQL query
- Simplifies the returned metadata to the above format
- Outputs only JSON without markdown wrappers

### 2. Rule Checker Agent
**Model**: Gemini 2.5 Flash  
**Purpose**: Checks query against BigQuery best practices  
**Rules Checked**:
1. NO_SELECT_STAR - Using SELECT * (except COUNT(*))
2. MISSING_PARTITION_FILTER - No filter on partition column
3. MISSING_LIMIT - No LIMIT clause for exploration queries
4. CROSS_JOIN_WARNING - Implicit or explicit cross joins
5. SUBQUERY_IN_WHERE - Inefficient subqueries
6. INEFFICIENT_JOIN_ORDER - Large tables joined before filtering
7. NO_WHERE_CLAUSE - Missing WHERE clause on large tables
8. MULTIPLE_WILDCARD_TABLES - Using table wildcards inefficiently

**Output Format**:
```json
{
    "rules_checked": 8,
    "violations_found": <number>,
    "compliance_score": <percentage>,
    "violations": [...],
    "passed_rules": [...],
    "summary": "..."
}
```

### 3. Query Optimizer Agent
**Model**: Gemini 2.5 Flash  
**Purpose**: Applies optimizations step by step  
**Output Format**:
```json
{
    "original_query": "...",
    "total_optimizations": <number>,
    "steps": [
        {
            "step": 1,
            "optimization": "...",
            "query_after": "...",
            "improvement": "...",
            "bytes_saved": "..."
        }
    ],
    "final_query": "...",
    "total_improvement": "...",
    "summary": "..."
}
```

### 4. Final Reporter Agent
**Model**: Gemini 2.5 Flash  
**Purpose**: Creates comprehensive final report  
**Output Format**:
```json
{
    "executive_summary": {
        "original_complexity": "high/medium/low",
        "optimized_complexity": "high/medium/low",
        "cost_reduction": "X%",
        "performance_gain": "Xx faster",
        "data_reduction": "XGB saved"
    },
    "metadata_summary": {...},
    "rules_summary": {...},
    "optimization_summary": {...},
    "recommendations": [...],
    "best_practices": [...]
}
```

## Real vs Mock Data

### Real Data Components:
1. **BigQuery Metadata Tool** (`app/tools/bigquery_metadata.py`)
   - Makes ACTUAL API calls to BigQuery
   - Fetches real table statistics (size, row count, schema)
   - Retrieves partition and clustering information
   - Handles wildcard tables (e.g., `events_*`)
   - Uses `INFORMATION_SCHEMA` for dataset statistics

2. **Google Cloud Integration**:
   - Project ID: `aiva-e74f3` (configurable)
   - Dataset: `analytics` (configurable)
   - Requires valid Google Cloud credentials

### Mock/Static Components:
1. **Authentication** (`app/auth.py`)
   - Demo login: demo@example.com / demo
   - JWT tokens for session management

2. **Storage Insights** (endpoint `/api/storage-insights`)
   - Returns hardcoded example data
   - Not connected to real BigQuery

3. **Query History** (endpoint `/api/query-history`)
   - Returns sample historical queries
   - Not persisted to database

## Streaming Architecture

### How Streaming Works:
1. Each agent has an `after_agent_callback` that triggers after completion
2. Callbacks create structured JSON outputs
3. Outputs are streamed via SSE to frontend
4. Frontend accumulates partial messages and processes complete ones

### Callback System:
```python
def create_streaming_callback(agent_name, stage_message, output_key):
    # Triggered after agent completes
    # Extracts output from session.state[output_key]
    # Cleans JSON (removes markdown wrappers)
    # Streams to frontend
```

## File Structure

```
backend/
├── app/
│   ├── streaming_agent.py     # Main agent pipeline (ACTIVE)
│   ├── main.py                # FastAPI endpoints (OLD - not used with ADK)
│   ├── rules.py               # Rule definitions
│   ├── auth.py                # Authentication (mock)
│   ├── models.py              # Pydantic models
│   └── tools/
│       ├── bigquery_metadata.py  # REAL BigQuery API integration
│       └── bigquery_tools.py     # Additional BQ utilities
├── start.sh                   # ADK server startup script
└── requirements.txt           # Python dependencies
```

## Environment Variables

```bash
GOOGLE_CLOUD_PROJECT=aiva-e74f3     # GCP Project ID
GOOGLE_CLOUD_LOCATION=us-central1   # Vertex AI location
BIGQUERY_DATASET=analytics          # Default dataset
```

## Running the Backend

```bash
# The backend runs as an ADK API server
./start.sh

# Or manually:
adk api_server app --port 8000
```

## API Endpoints (ADK)

- `POST /run_sse` - Main streaming endpoint for query optimization
- `POST /apps/app/users/{userId}/sessions/{sessionId}` - Create session
- `GET /docs` - API documentation

## Key Dependencies

- `google-adk` - Agent Development Kit
- `google-cloud-bigquery` - BigQuery client
- `google-cloud-aiplatform` - Vertex AI
- `fastapi` - Web framework (for old endpoints)
- `pydantic` - Data validation

## Notes

1. **Actual vs Mock**: The metadata extraction uses REAL BigQuery API calls, while auth and some dashboard features are mocked.

2. **Streaming**: Uses SSE for real-time updates as each agent completes.

3. **Error Handling**: Each agent has try-catch with fallback to raw text if JSON parsing fails.

4. **Performance**: Uses Gemini 2.5 Flash for fast response times.

5. **Scalability**: ADK handles agent orchestration and scaling automatically.