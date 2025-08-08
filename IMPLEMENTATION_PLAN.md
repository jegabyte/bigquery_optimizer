# BigQuery Optimizer - ADK Implementation Plan

## Project Overview
Transform the current mock BigQuery Optimizer into a production-ready system using Google ADK (Agent Development Kit) for real BigQuery integration and multi-agent orchestration.

## Current Architecture Status

### ✅ What's Already Built

#### Frontend (React + Vite)
- **UI Components**: Complete professional UI with blue theme
  - Login page with authentication flow
  - Dashboard with charts and metrics
  - Query Analysis page with Monaco editor
  - Storage Insights page
  - Compact progress stepper for pipeline visualization
  
- **Features Implemented**:
  - ✅ Unique analysis ID generation and URL routing
  - ✅ Auto-save query to localStorage
  - ✅ Real-time progress tracking UI
  - ✅ Re-run analysis with same ID
  - ✅ Share analysis via URL
  - ✅ Edit and re-analyze queries
  - ✅ Result visualization (issues, optimized query, validation)

#### Backend (FastAPI - Mock Implementation)
- **Current Structure**:
  ```
  backend/
  ├── app/
  │   ├── main.py         # FastAPI endpoints
  │   ├── agents.py       # Mock agents (not real ADK)
  │   ├── models.py       # Pydantic models
  │   ├── auth.py         # JWT authentication
  │   └── rules.py        # Rule management
  ```

- **Mock Endpoints**:
  - `POST /api/optimize-query` - Returns mock optimization results
  - `POST /api/auth/login` - Mock authentication
  - `GET /api/projects` - Mock project list
  - `GET /api/query-history` - Mock query history
  - `GET /api/storage-insights` - Mock storage analysis

- **Mock Agents** (Not using ADK):
  - MetadataAgent - Returns hardcoded metadata
  - RuleValidationAgent - Simple pattern matching
  - RewriteAgent - Returns fixed optimized query
  - ValidationAgent - Random cost savings

### ⚠️ Current Limitations
1. **No Real BigQuery Integration** - All data is mocked
2. **No Real AI/LLM** - Using simple pattern matching instead of Gemini
3. **No Agent Orchestration** - Sequential function calls, not real agents
4. **No State Management** - Results not persisted properly
5. **Mock Authentication** - No real user management

---

## Target Architecture with ADK

### Architecture Diagram
```
┌─────────────────────────────────────────────┐
│            React Frontend (Existing)         │
│  • Dashboard  • Query Editor  • Results      │
└─────────────────┬───────────────────────────┘
                  │
                  │ HTTP/Streaming
                  │
┌─────────────────▼───────────────────────────┐
│         ADK API Server (Port 8000)          │
│                                              │
│  ┌─────────────────────────────────────┐   │
│  │    Query Optimizer Orchestrator      │   │
│  │         (Root Agent)                 │   │
│  └────────────────┬────────────────────┘   │
│                   │                          │
│  ┌────────────────▼────────────────────┐   │
│  │    Optimization Pipeline             │   │
│  │    (SequentialAgent)                 │   │
│  │                                      │   │
│  │  1. Metadata Extractor Agent        │   │
│  │  2. Rule Validator Agent            │   │
│  │  3. Query Rewriter Agent            │   │
│  │  4. Result Validator Agent          │   │
│  └──────────────────────────────────────┘   │
└──────────────────┬──────────────────────────┘
                   │
                   │ BigQuery API
                   │
┌──────────────────▼──────────────────────────┐
│              Google BigQuery                 │
│         (Real Data & Metadata)               │
└──────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Frontend-First Data Management (Week 1)
**Goal**: Move non-agent functionality to frontend

#### 1.1 Authentication (Firebase/Supabase)
```javascript
// TODO: services/auth.js
- [ ] Set up Firebase project
- [ ] Implement Firebase Auth integration
- [ ] Add Google OAuth login
- [ ] Update AuthContext to use Firebase
- [ ] Remove backend JWT logic
```

#### 1.2 Local Data Storage (IndexedDB)
```javascript
// TODO: services/database.js
- [ ] Install Dexie for IndexedDB
- [ ] Create database schema (projects, analyses, history)
- [ ] Implement CRUD operations
- [ ] Migrate dashboard to use local data
- [ ] Add data persistence for analyses
```

#### 1.3 Update Frontend Services
```javascript
// TODO: Update existing components
- [ ] Dashboard.jsx - Use local data instead of API
- [ ] QueryAnalysis.jsx - Save results locally
- [ ] Projects.jsx - Local project management
- [ ] Remove dependency on backend CRUD endpoints
```

**Deliverables**:
- Frontend works independently for auth and data
- All user data stored in browser
- Only optimization needs backend

---

### Phase 2: ADK Backend Setup (Week 2)
**Goal**: Replace mock backend with real ADK agents

#### 2.1 Project Restructuring
```bash
# TODO: New backend structure
backend/
├── app/
│   ├── __init__.py          # Root agent export
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── orchestrator.py  # Main coordinator
│   │   ├── metadata.py      # BigQuery metadata extractor
│   │   ├── validator.py     # Rule validation with Gemini
│   │   ├── rewriter.py      # Query optimization
│   │   └── verifier.py      # Result validation
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── bigquery_tools.py  # BigQuery connections
│   │   └── gemini_tools.py    # LLM integration
│   ├── config.py            # ADK configuration
│   └── callbacks.py         # Progress tracking
├── pyproject.toml           # Add google-adk dependency
└── Makefile                 # Dev commands
```

#### 2.2 Dependencies Installation
```toml
# TODO: pyproject.toml
- [ ] Add google-adk = "^1.4.2"
- [ ] Add google-cloud-bigquery = "^3.13.0"
- [ ] Add google-generativeai
- [ ] Remove FastAPI (ADK provides it)
- [ ] Remove custom agent code
```

#### 2.3 Environment Setup
```bash
# TODO: .env configuration
- [ ] GOOGLE_CLOUD_PROJECT=your-project-id
- [ ] GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
- [ ] GOOGLE_GENAI_USE_VERTEXAI=True (or False for AI Studio)
- [ ] Remove custom API keys
```

---

### Phase 3: ADK Agent Implementation (Week 3)
**Goal**: Build real agents with BigQuery and Gemini integration

#### 3.1 Root Orchestrator Agent
```python
# TODO: app/agents/orchestrator.py
- [ ] Create LlmAgent with Gemini model
- [ ] Define orchestration instruction prompt
- [ ] Add AgentTool wrapper for pipeline
- [ ] Configure output schema
```

#### 3.2 Metadata Extractor Agent
```python
# TODO: app/agents/metadata.py
- [ ] Create BigQuery client tool
- [ ] Implement table schema extraction
- [ ] Add partition/clustering detection
- [ ] Store metadata in session state
```

#### 3.3 Rule Validator Agent
```python
# TODO: app/agents/validator.py
- [ ] Load rules from YAML configuration
- [ ] Generate validation prompt with rules
- [ ] Use Gemini for pattern detection
- [ ] Output structured violations (Pydantic)
```

#### 3.4 Query Rewriter Agent
```python
# TODO: app/agents/rewriter.py
- [ ] Create rewrite prompt from violations
- [ ] Implement iterative refinement loop
- [ ] Add cost estimation tool
- [ ] Generate optimized SQL
```

#### 3.5 Result Validator Agent
```python
# TODO: app/agents/verifier.py
- [ ] Implement dry-run for both queries
- [ ] Compare bytes processed
- [ ] Calculate cost savings
- [ ] Verify result equivalence
```

---

### Phase 4: BigQuery Integration (Week 3)
**Goal**: Connect to real BigQuery for metadata and validation

#### 4.1 BigQuery Tools
```python
# TODO: app/tools/bigquery_tools.py
- [ ] get_table_metadata() - Schema, partitioning, clustering
- [ ] analyze_query_cost() - Dry-run for cost estimation
- [ ] get_table_sample() - Sample data for validation
- [ ] execute_query() - Run queries with limits
```

#### 4.2 Authentication & Permissions
```bash
# TODO: GCP Setup
- [ ] Create service account
- [ ] Grant BigQuery Data Viewer role
- [ ] Grant BigQuery Job User role
- [ ] Download credentials JSON
- [ ] Configure ADC (Application Default Credentials)
```

---

### Phase 5: Frontend Integration (Week 4)
**Goal**: Connect frontend to ADK API Server

#### 5.1 ADK Service Layer
```javascript
// TODO: services/adk.js
- [ ] Implement streaming client
- [ ] Handle /runs/stream endpoint
- [ ] Process streaming responses
- [ ] Update progress in real-time
```

#### 5.2 Update API Calls
```javascript
// TODO: Update components
- [ ] QueryAnalysis.jsx - Call ADK instead of custom API
- [ ] Remove calls to /api/optimize-query
- [ ] Handle streaming updates
- [ ] Update progress tracking
```

#### 5.3 State Management
```javascript
// TODO: State synchronization
- [ ] Save ADK results to IndexedDB
- [ ] Update local statistics
- [ ] Maintain query history
- [ ] Handle offline scenarios
```

---

### Phase 6: Testing & Deployment (Week 5)
**Goal**: Production deployment with monitoring

#### 6.1 Testing
```bash
# TODO: Test coverage
- [ ] Unit tests for agents
- [ ] Integration tests with BigQuery
- [ ] Frontend component tests
- [ ] End-to-end testing
```

#### 6.2 Deployment Setup
```yaml
# TODO: deployment/
- [ ] Dockerfile for ADK service
- [ ] Cloud Run configuration
- [ ] Frontend deployment to Vercel/Netlify
- [ ] Environment variables management
```

#### 6.3 Monitoring
```bash
# TODO: Observability
- [ ] Enable ADK tracing
- [ ] Set up Cloud Logging
- [ ] Add error tracking (Sentry)
- [ ] Performance monitoring
```

---

## Migration Checklist

### Backend Migration Steps
1. **Stop using custom FastAPI** ❌
   ```bash
   # OLD: uvicorn app.main:app
   # NEW: uv run adk api_server app
   ```

2. **Remove mock agents** ❌
   - Delete `app/agents.py` (mock implementation)
   - Create `app/agents/` directory with real ADK agents

3. **Update imports** ❌
   ```python
   # OLD: from app.agents import AgentPipeline
   # NEW: from app.agents.orchestrator import query_optimizer_agent
   ```

4. **Configure root agent** ❌
   ```python
   # app/__init__.py
   root_agent = query_optimizer_agent  # ADK picks this up
   ```

### Frontend Migration Steps
1. **Update API endpoints** ❌
   ```javascript
   // OLD: POST /api/optimize-query
   // NEW: POST /runs/stream
   ```

2. **Add streaming support** ❌
   ```javascript
   // Handle chunked responses
   const reader = response.body.getReader();
   ```

3. **Update authentication** ❌
   ```javascript
   // Use Firebase instead of backend JWT
   ```

---

## Development Commands

### Current (Mock Backend)
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Target (ADK Backend)
```bash
# Backend
cd backend
uv sync  # Install dependencies including ADK
uv run adk api_server app --port 8000

# Frontend (unchanged)
cd frontend
npm install
npm run dev

# ADK Playground (for testing agents)
uv run adk web --port 8501
```

---

## Success Metrics

### Functional Requirements
- [ ] Real BigQuery integration working
- [ ] Actual query optimization using Gemini
- [ ] Cost savings calculation from dry-runs
- [ ] Persistent storage of analyses
- [ ] User authentication with Google

### Performance Targets
- [ ] Query analysis < 5 seconds
- [ ] Frontend loads < 2 seconds
- [ ] Streaming updates every 500ms
- [ ] 99% uptime SLA

### Quality Metrics
- [ ] 80% test coverage
- [ ] Zero critical security issues
- [ ] Accessibility WCAG 2.1 AA
- [ ] Mobile responsive design

---

## Risk Mitigation

### Technical Risks
1. **BigQuery Costs**
   - Mitigation: Use dry-run only, implement quotas

2. **Gemini API Limits**
   - Mitigation: Implement caching, rate limiting

3. **Frontend Data Loss**
   - Mitigation: Regular export, cloud backup option

### Timeline Risks
1. **ADK Learning Curve**
   - Mitigation: Start with simple agents, iterate

2. **BigQuery Permissions**
   - Mitigation: Early testing with sample dataset

---

## Next Immediate Steps

### This Week (Priority 1)
1. [ ] Set up Firebase project for authentication
2. [ ] Install ADK in backend (`pip install google-adk`)
3. [ ] Create simple "Hello World" ADK agent
4. [ ] Test BigQuery connection with service account

### Next Week (Priority 2)
1. [ ] Implement first real agent (Metadata Extractor)
2. [ ] Add IndexedDB to frontend
3. [ ] Create streaming endpoint connection
4. [ ] Deploy to Cloud Run for testing

---

## Resources & Documentation

### Essential Documentation
- [Google ADK Documentation](https://cloud.google.com/agent-development-kit/docs)
- [ADK Samples Repository](https://github.com/google/adk-samples)
- [BigQuery Python Client](https://cloud.google.com/bigquery/docs/reference/libraries)
- [Gemini API](https://ai.google.dev/docs)

### Reference Implementation
- Sample ADK project: `/Users/mobionix/workspace/prototype/adk-samples/python/agents/gemini-fullstack`
- Brand optimization example with BigQuery integration

---

## Budget Estimation

### Development Costs
- ADK/Gemini API: ~$50/month during development
- BigQuery: ~$10/month (dry-runs only)
- Firebase: Free tier sufficient
- Cloud Run: ~$20/month

### Production Costs (1000 users)
- ADK/Gemini API: ~$200/month
- BigQuery: ~$50/month (dry-runs)
- Firebase Auth: Free up to 10k users
- Cloud Run: ~$100/month
- **Total: ~$350/month**

---

## Conclusion

The migration from mock backend to ADK-based real implementation is a significant upgrade that will provide:
1. **Real BigQuery integration** instead of mock data
2. **AI-powered optimization** using Gemini
3. **Production-ready architecture** with Google's ADK
4. **Scalable multi-agent system** with proper orchestration
5. **Modern frontend-first approach** with local data management

The implementation can be done incrementally, maintaining the existing UI while upgrading the backend capabilities.