#!/bin/bash
# BigQuery Optimizer Backend Startup Script

echo "🚀 Starting BigQuery Optimizer Backend..."

# Set the working directory
cd "$(dirname "$0")"

# Set Python path
export PYTHONPATH=$(pwd)

# Start the server with Python 3.10
python3.10 start_server.py