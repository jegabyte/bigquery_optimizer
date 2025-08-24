# BigQuery Optimizer - Project Analysis Flow

## Overview
This document provides a comprehensive sequence flow diagram of how the BigQuery Optimizer analyzes projects.

## Process Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant BackendAPI as Backend API
    participant BQ as BigQuery
    participant AgentAPI as Agent API
    participant Storage as Storage (BQ Tables)
    
    User->>Frontend: Add New Project
    Frontend->>BackendAPI: POST /api/projects/validate-access
    
    Note over BackendAPI: Step 1: Validation
    BackendAPI->>BQ: Check INFORMATION_SCHEMA access
    BQ-->>BackendAPI: Access verification result
    BackendAPI->>BQ: Validate project permissions
    BQ-->>BackendAPI: Permissions & basic stats
    BackendAPI-->>Frontend: Validation result
    
    alt Validation Failed
        Frontend-->>User: Show error message
    else Validation Successful
        Frontend->>BackendAPI: POST /api/projects/scan-information-schema
        
        par Step 2: Query Analysis (Parallel)
            Note over BackendAPI: Query Template Analysis
            BackendAPI->>BQ: Query INFORMATION_SCHEMA.JOBS_BY_PROJECT
            BQ-->>BackendAPI: Job history & query data
            BackendAPI->>BackendAPI: Extract query templates
            BackendAPI->>BackendAPI: Calculate impact metrics
            BackendAPI->>Storage: Store templates in BQ
            
            loop For each high-impact template
                BackendAPI->>AgentAPI: Analyze query template
                Note over AgentAPI: Sequential Agent Flow
                AgentAPI->>AgentAPI: 1. Metadata Extraction
                AgentAPI->>BQ: Fetch table metadata
                BQ-->>AgentAPI: Table info (size, partitions, clusters)
                AgentAPI->>AgentAPI: 2. Anti-Pattern Detection
                AgentAPI->>AgentAPI: Check 22 optimization rules
                AgentAPI->>AgentAPI: 3. Query Optimization
                AgentAPI->>BQ: Dry run original query
                BQ-->>AgentAPI: Cost metrics
                AgentAPI->>AgentAPI: Generate optimized query
                AgentAPI->>BQ: Dry run optimized query
                BQ-->>AgentAPI: New cost metrics
                AgentAPI->>AgentAPI: 4. Generate Insights
                AgentAPI-->>BackendAPI: Optimization results
            end
            
            BackendAPI->>Storage: Store analysis results
        and Step 3: Table Analysis (Parallel)
            Note over BackendAPI: Table Storage Analysis
            BackendAPI->>BQ: Query INFORMATION_SCHEMA.TABLES
            BQ-->>BackendAPI: Table metadata
            BackendAPI->>BQ: Query INFORMATION_SCHEMA.TABLE_STORAGE
            BQ-->>BackendAPI: Storage metrics
            BackendAPI->>BQ: Query INFORMATION_SCHEMA.JOBS (6 months)
            BQ-->>BackendAPI: Table usage patterns
            BackendAPI->>BackendAPI: Calculate storage costs
            BackendAPI->>BackendAPI: Identify unused tables
            BackendAPI->>BackendAPI: Analyze partitioning efficiency
            BackendAPI->>Storage: Store table analysis
        end
        
        BackendAPI-->>Frontend: Analysis complete
        Frontend->>BackendAPI: GET /api/projects/{id}/templates
        BackendAPI->>Storage: Fetch templates
        Storage-->>BackendAPI: Template data
        BackendAPI-->>Frontend: Templates with insights
        
        Frontend->>BackendAPI: GET /api/projects/{id}/table-analysis
        BackendAPI->>Storage: Fetch table analysis
        Storage-->>BackendAPI: Table analysis data
        BackendAPI-->>Frontend: Table insights
        
        Frontend-->>User: Display analysis results
    end
```

## Component Details

### 1. Validation Phase
- **Endpoint**: `/api/projects/validate-access`
- **Purpose**: Verify project access and permissions
- **Checks**:
  - INFORMATION_SCHEMA access
  - Project permissions
  - Basic statistics retrieval

### 2. Query Analysis (Parallel Process)
- **Endpoint**: `/api/projects/scan-information-schema`
- **Components**:
  - **Template Extraction**: Queries INFORMATION_SCHEMA.JOBS_BY_PROJECT
  - **Impact Calculation**: Identifies high-impact queries by cost and frequency
  - **Agent Analysis**: Each template analyzed by sequential agent flow:
    1. **Metadata Extractor**: Fetches table metadata
    2. **Rule Checker**: Evaluates 22 anti-pattern rules
    3. **Query Optimizer**: Creates optimized version with cost comparison
    4. **Insights Generator**: Produces actionable recommendations

### 3. Table Analysis (Parallel Process)
- **Endpoint**: `/api/projects/analyze-tables`
- **Components**:
  - **Storage Analysis**: INFORMATION_SCHEMA.TABLES & TABLE_STORAGE
  - **Usage Patterns**: 6-month query history analysis
  - **Cost Calculation**: Active vs long-term storage costs
  - **Optimization Opportunities**:
    - Unused tables identification
    - Partition efficiency analysis
    - Clustering recommendations

## Key Features

1. **Parallel Processing**: Query and table analysis run simultaneously for efficiency
2. **Agent-Based Optimization**: Each query template gets individual AI-powered analysis
3. **Comprehensive Metrics**: Cost, performance, and usage patterns tracked
4. **Persistent Storage**: All results stored in BigQuery for historical analysis

## Data Storage Tables

- `bq_optimizer.templates`: Query templates and patterns
- `bq_optimizer.table_analysis`: Table storage and usage metrics
- `bq_optimizer.analyses`: Agent-generated optimization insights

## Performance Considerations

- Analysis window: Configurable (default 30 days)
- High-impact threshold: Queries > $1 or > 100GB processed
- Batch processing: Multiple templates analyzed concurrently
- Result caching: Analysis results stored for quick retrieval