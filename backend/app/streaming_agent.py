"""
Streaming Structured Output Agent for UI Integration
Returns JSON-structured optimization results with stage-by-stage streaming
"""

import logging
from app.agents.orchestrator import streaming_orchestrator
from app.rules import RulesetManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize rules manager
rules_manager = RulesetManager()

# Export the root agent
root_agent = streaming_orchestrator

__all__ = ["root_agent"]