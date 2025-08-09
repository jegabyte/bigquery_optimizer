"""
Main Orchestrator Agent
Coordinates the optimization pipeline with streaming outputs
"""

import os
from google.adk.agents import LlmAgent, SequentialAgent
from app.agents.metadata_extractor import metadata_extractor
from app.agents.rule_checker import rule_checker
from app.agents.query_optimizer import query_optimizer
from app.agents.final_reporter import final_reporter
from app.agents.tracing import create_optimization_trace, add_trace_event, set_trace_attribute

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
DATASET = os.getenv("BIGQUERY_DATASET", "analytics")

# Streaming Pipeline - Sequential execution of all agents
streaming_pipeline = SequentialAgent(
    name="streaming_pipeline",
    description="Optimization pipeline with stage-by-stage streaming",
    sub_agents=[
        metadata_extractor,
        rule_checker,
        query_optimizer,
        final_reporter
    ]
)

# Main Orchestrator - Entry point for the optimization
streaming_orchestrator = LlmAgent(
    name="streaming_orchestrator",
    model="gemini-2.5-flash",
    description="Orchestrates optimization with streaming outputs",
    instruction=f"""
    You are the BigQuery Optimization Orchestrator with streaming capabilities.
    
    When you receive a query to optimize:
    1. Pass it directly to the streaming_pipeline
    2. Each stage will stream its output immediately
    3. The pipeline will accumulate outputs from each stage
    
    The pipeline stages process data sequentially:
    1. 📊 Metadata Extraction - Analyzes the query and fetches table metadata
       → Outputs: metadata_output (JSON with table info)
    
    2. ✅ Rule Checking - Receives query + metadata_output, checks against rules.yaml
       → Outputs: rules_output (JSON with violations and compliance)
    
    3. 🚀 Query Optimization - Receives query + metadata_output + rules_output, applies fixes
       → Outputs: optimization_output (JSON with step-by-step optimizations)
    
    4. 📋 Final Report - Receives all previous outputs, creates summary
       → Outputs: final_output (JSON with comprehensive report)
    
    Configuration:
    - Project: {PROJECT_ID}
    - Dataset: {DATASET}
    - Location: {LOCATION}
    
    Simply pass the query to the streaming_pipeline and it will handle the rest.
    """,
    sub_agents=[streaming_pipeline]
)