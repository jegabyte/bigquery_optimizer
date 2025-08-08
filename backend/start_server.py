#!/usr/bin/env python3.10
"""
BigQuery Optimizer Backend Server Startup Script

This script starts the FastAPI server with the correct Python version and configuration.
"""

import os
import sys

# Set the Python path to include the backend directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

# Set environment variable for Python path
os.environ['PYTHONPATH'] = backend_dir

if __name__ == "__main__":
    import uvicorn
    from app.main import app
    
    print("🚀 Starting BigQuery Optimizer Backend Server...")
    print(f"📁 Backend directory: {backend_dir}")
    print(f"🐍 Python version: {sys.version}")
    print("🌐 Server will be available at: http://localhost:8000")
    print("📖 API documentation will be available at: http://localhost:8000/docs")
    print()
    
    # Start the server
    print("🔧 Starting Uvicorn server...")
    try:
        uvicorn.run(
            "app.main:app",  # Use string import for reload to work
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        # Fallback without reload
        print("🔄 Trying without reload...")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            reload=False,
            log_level="info"
        )