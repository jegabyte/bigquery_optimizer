"""
BigQuery Optimizer ADK Backend
Root agent configuration for ADK API Server
"""

# Import root_agent directly for ADK deployment
from app.agent import root_agent

__all__ = ["root_agent"]