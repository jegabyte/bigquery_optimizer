"""
BigQuery Optimizer Agent - ADK Deployment Entry Point
"""
from app.agents.orchestrator import streaming_orchestrator
from app.rules import RulesetManager

# Initialize rules manager
rules_manager = RulesetManager()

# Root agent for ADK deployment
root_agent = streaming_orchestrator