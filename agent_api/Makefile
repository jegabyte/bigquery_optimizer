.PHONY: install run dev playground test clean help

# Default target
help:
	@echo "BigQuery Optimizer Backend - Make Commands"
	@echo ""
	@echo "Available commands:"
	@echo "  make install    - Install dependencies using uv"
	@echo "  make run        - Run the ADK API server"
	@echo "  make dev        - Run the ADK API server in development mode"
	@echo "  make playground - Run the ADK playground UI"
	@echo "  make test       - Run tests"
	@echo "  make clean      - Clean up generated files and cache"
	@echo ""

# Install dependencies
install:
	uv sync

# Run ADK API server
run:
	source .venv/bin/activate && uv run adk api_server app --port 8000

# Run ADK API server in development mode with reload
dev:
	source .venv/bin/activate && uv run adk api_server app --port 8000 --reload

# Run ADK playground for testing agents
playground:
	source .venv/bin/activate && uv run adk web --port 8501

# Run tests
test:
	source .venv/bin/activate && uv run pytest tests/

# Clean up
clean:
	rm -rf .venv
	rm -rf __pycache__
	rm -rf app/__pycache__
	rm -rf app/agents/__pycache__
	rm -rf app/tools/__pycache__
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete