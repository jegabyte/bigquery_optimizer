"""
BigQuery Optimizer ADK Backend
Root agent configuration for ADK API Server
"""

# Use the streaming agent for better UI integration with stage-by-stage outputs
from app.streaming_agent import root_agent

__all__ = ["root_agent"]