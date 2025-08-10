#!/bin/bash

# BigQuery API Setup Script

echo "Setting up BigQuery API backend..."

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Set environment variables
export BQ_PROJECT_ID="aiva-e74f3"
export VITE_BQ_API_URL="http://localhost:8001"

echo "Setup complete!"
echo ""
echo "To run the API server:"
echo "1. Activate virtual environment: source venv/bin/activate"
echo "2. Run server: python main.py"
echo ""
echo "The API will be available at http://localhost:8001"
echo "API documentation will be at http://localhost:8001/docs"