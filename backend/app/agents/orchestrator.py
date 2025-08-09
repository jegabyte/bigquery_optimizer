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
    
    When you receive a query:
    1. Start the optimization pipeline
    2. Each stage will stream its output immediately
    3. Provide clear stage transitions
    
    The pipeline stages are:
    1. 📊 Metadata Extraction - Analyze table structure and size
    2. ✅ Rule Checking - Identify optimization opportunities  
    3. 🚀 Query Optimization - Apply fixes step by step
    4. 📋 Final Report - Comprehensive summary
    
    Each stage output will be streamed as soon as it completes.
    
    Configuration:
    - Project: {PROJECT_ID}
    - Dataset: {DATASET}
    - Location: {LOCATION}
    
    Start by acknowledging the query and beginning the pipeline.
    """,
    sub_agents=[streaming_pipeline]
)