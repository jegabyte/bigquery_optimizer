#!/usr/bin/env python3
"""
Deploy BigQuery Optimizer to Vertex AI Agent Engine with Cloud Trace
"""

import os
from vertexai.preview import reasoning_engines
from vertexai import agent_engines
import vertexai

# Import your root agent
from app.streaming_agent import root_agent

# Configuration
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
STAGING_BUCKET = os.environ.get("STAGING_BUCKET", f"gs://{PROJECT_ID}-agent-staging")

print(f"🚀 Deploying BigQuery Optimizer to Agent Engine")
print(f"📍 Project: {PROJECT_ID}")
print(f"📍 Location: {LOCATION}")
print(f"📦 Staging Bucket: {STAGING_BUCKET}")

# Initialize Vertex AI
vertexai.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)

# Create ADK App with Cloud Trace enabled
print("📊 Creating ADK App with Cloud Trace enabled...")
adk_app = reasoning_engines.AdkApp(
    agent=root_agent,
    enable_tracing=True,  # Enable Cloud Trace
)

# Deploy to Agent Engine
print("🚢 Deploying to Agent Engine...")
remote_app = agent_engines.create(
    agent_engine=adk_app,
    display_name="bigquery-optimizer-agent",
    description="BigQuery query optimization agent with Cloud Trace monitoring",
    extra_packages=[
        "./app",
    ],
    requirements=[
        "google-cloud-aiplatform[adk,agent_engines]",
        "google-cloud-bigquery",
        "google-cloud-trace",  # Add Cloud Trace dependency
        "opentelemetry-api",
        "opentelemetry-sdk",
        "opentelemetry-exporter-gcp-trace",
    ],
)

print(f"✅ Deployment successful!")
print(f"🔗 Agent ID: {remote_app.resource_name}")
print(f"📊 View traces at: https://console.cloud.google.com/traces/list?project={PROJECT_ID}")
print(f"\n📖 To test the deployed agent:")
print(f"   remote_app.query(query='SELECT * FROM dataset.table')")