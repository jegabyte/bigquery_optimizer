"""
BigQuery Optimizer ADK Backend
Root agent configuration for ADK API Server
"""

# Use the rule-based agent with clear intermediate outputs
from app.rule_based_agent import root_agent

__all__ = ["root_agent"]