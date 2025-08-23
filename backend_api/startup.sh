#!/bin/bash
# Startup script for Backend API

# Determine which backend to use
if [ "$BACKEND_TYPE" = "bigquery" ]; then
    echo "Starting BigQuery backend..."
    exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}
else
    echo "Starting Firestore backend (default)..."
    exec uvicorn main_firestore:app --host 0.0.0.0 --port ${PORT:-8001}
fi
