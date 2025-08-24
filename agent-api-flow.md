# BigQuery Optimizer - Agent API Flow (ADK)

## High-Level Agent Sequence Flow

```mermaid
sequenceDiagram
    participant Client
    participant Orchestrator as Orchestrator Agent
    participant Pipeline as Sequential Pipeline
    participant Metadata as Metadata Agent
    participant Rules as Rule Checker Agent
    participant Optimizer as Optimizer Agent
    participant Validator as Validator Agent
    participant Tools as ADK Tools
    participant BQ as BigQuery
    
    Client->>Orchestrator: Submit Query for Optimization
    
    Orchestrator->>Pipeline: Execute Sequential Pipeline
    
    rect rgb(240, 248, 255)
        Note over Pipeline,BQ: Stage 1: Metadata Extraction
        Pipeline->>Metadata: Analyze Query
        Metadata->>Tools: fetch_tables_metadata()
        Tools->>BQ: Get Table Info
        BQ-->>Tools: Table Metadata
        Tools-->>Metadata: Tables Data
        Metadata-->>Pipeline: metadata_output (JSON)
    end
    
    rect rgb(255, 250, 240)
        Note over Pipeline,BQ: Stage 2: Rule Analysis
        Pipeline->>Rules: Check Anti-patterns
        Rules->>Rules: Load Rules (22 patterns)
        Rules->>Rules: Analyze Query + Metadata
        Rules-->>Pipeline: rules_output (violations, compliance)
    end
    
    rect rgb(240, 255, 240)
        Note over Pipeline,BQ: Stage 3: Query Optimization
        Pipeline->>Optimizer: Generate Optimized Query
        Optimizer->>Tools: bigquery_dry_run(original)
        Tools->>BQ: Dry Run Original
        BQ-->>Tools: Cost Metrics
        Optimizer->>Optimizer: Apply Optimizations
        Optimizer->>Tools: bigquery_dry_run(optimized)
        Tools->>BQ: Dry Run Optimized
        BQ-->>Tools: New Cost Metrics
        Optimizer-->>Pipeline: optimization_output (query + savings)
    end
    
    rect rgb(255, 240, 245)
        Note over Pipeline,BQ: Stage 4: Validation
        Pipeline->>Validator: Validate Results
        Validator->>Tools: bigquery_dry_run(both queries)
        Tools->>BQ: Schema Validation
        BQ-->>Tools: Schema Info
        Validator->>Validator: Compare Schemas
        Validator-->>Pipeline: validation_output (status)
    end
    
    Pipeline-->>Orchestrator: Complete Pipeline Results
    Orchestrator-->>Client: Final Optimization Report
```

## Agent Pipeline Overview

### Orchestrator Agent
- **Model**: Gemini 2.5 Flash
- **Role**: Entry point and coordinator
- **Function**: Routes queries to sequential pipeline

### Sequential Pipeline Stages

#### 1. Metadata Extraction Agent
- **Purpose**: Fetch table metadata for referenced tables
- **Tool**: `fetch_tables_metadata()`
- **Output**: Table sizes, partitioning, clustering info

#### 2. Rule Checker Agent  
- **Purpose**: Detect BigQuery anti-patterns
- **Input**: Query + Metadata
- **Output**: Violations, compliance score, passed rules

#### 3. Query Optimizer Agent
- **Purpose**: Generate optimized query version
- **Tool**: `bigquery_dry_run()`
- **Output**: Optimized query with cost comparison

#### 4. Validation Agent
- **Purpose**: Validate optimized query correctness
- **Tool**: `bigquery_dry_run()`
- **Output**: Schema validation, syntax check results

## ADK Tools Integration

### Core Tools
1. **fetch_tables_metadata**: Retrieves BigQuery table information
2. **bigquery_dry_run**: Validates queries and estimates costs without execution

### Data Flow
- Each agent receives outputs from previous stages
- Tools interact directly with BigQuery APIs
- Results streamed back through pipeline

## Key Features
- **Sequential Processing**: Each stage builds on previous results
- **Cost Validation**: Real-time cost estimates via dry runs
- **Schema Safety**: Ensures optimized queries maintain correct output
- **Streaming Output**: Real-time progress updates at each stage