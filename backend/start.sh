#!/bin/bash
# BigQuery Optimizer Backend Startup Script

echo "🚀 Starting BigQuery Optimizer ADK API Server..."

# Set the working directory
cd "$(dirname "$0")"

# Activate virtual environment if it exists
if [ -f "venv/bin/activate" ]; then
    echo "📦 Activating venv..."
    source venv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
    echo "📦 Activating .venv..."
    source .venv/bin/activate
fi

# Check if uv is available
if command -v uv &> /dev/null; then
    echo "🔧 Starting ADK API server with uv..."
    uv run adk api_server app --port 8000
elif command -v adk &> /dev/null; then
    echo "🔧 Starting ADK API server..."
    adk api_server app --port 8000
else
    echo "❌ Error: ADK not found. Please install ADK or use uv."
    echo "Run: pip install google-adk"
    exit 1
fi