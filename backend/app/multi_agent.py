"""
BigQuery Optimizer Multi-Agent System
Following the gemini-fullstack pattern with specialized agents
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Literal, List
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent, LlmAgent, SequentialAgent, LoopAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.agents.callback_context import CallbackContext
from google.adk.events import Event, EventActions
from google.adk.tools import FunctionTool
from google.adk.planners import BuiltInPlanner
from google.adk.tools.agent_tool import AgentTool
from google.genai import types as genai_types
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
DATASET = os.getenv("BIGQUERY_DATASET", "analytics")

# --- Structured Output Models ---
class QueryAnalysis(BaseModel):
    """Model for initial query analysis"""
    query_type: Literal["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "OTHER"] = Field(
        description="Type of SQL query"
    )
    estimated_complexity: Literal["low", "medium", "high"] = Field(
        description="Estimated query complexity"
    )
    tables_involved: List[str] = Field(
        description="List of tables referenced in the query"
    )
    has_joins: bool = Field(description="Whether query contains JOINs")
    has_subqueries: bool = Field(description="Whether query contains subqueries")
    has_aggregations: bool = Field(description="Whether query uses GROUP BY or aggregation functions")
    initial_issues: List[str] = Field(description="Obvious issues spotted in initial analysis")


class OptimizationPlan(BaseModel):
    """Model for optimization plan"""
    optimization_goals: List[str] = Field(
        description="List of optimization goals to achieve"
    )
    techniques_to_apply: List[str] = Field(
        description="Specific optimization techniques to apply"
    )
    priority: Literal["performance", "cost", "balanced"] = Field(
        description="Primary optimization priority"
    )


class OptimizationResult(BaseModel):
    """Model for final optimization result"""
    original_query: str = Field(description="Original SQL query")
    optimized_query: str = Field(description="Optimized SQL query")
    improvements: List[str] = Field(description="List of improvements made")
    estimated_performance_gain: str = Field(description="Estimated performance improvement")
    estimated_cost_reduction: str = Field(description="Estimated cost reduction")
    
    
class ValidationFeedback(BaseModel):
    """Model for validation feedback"""
    is_valid: bool = Field(description="Whether the optimized query is valid")
    syntax_errors: List[str] = Field(description="Any syntax errors found")
    semantic_issues: List[str] = Field(description="Any semantic issues found")
    suggestions: List[str] = Field(description="Additional suggestions for improvement")


# --- Callbacks ---
def collect_optimization_metrics_callback(callback_context: CallbackContext) -> None:
    """Collects optimization metrics throughout the process"""
    session = callback_context._invocation_context.session
    metrics = callback_context.state.get("metrics", {})
    
    # Collect timing information
    if "start_time" not in metrics:
        metrics["start_time"] = datetime.now().isoformat()
    
    # Collect analysis results
    if "query_analysis" in session.state:
        metrics["complexity"] = session.state["query_analysis"].get("estimated_complexity", "unknown")
        metrics["tables_count"] = len(session.state["query_analysis"].get("tables_involved", []))
    
    # Collect optimization results
    if "optimization_result" in session.state:
        metrics["improvements_count"] = len(session.state["optimization_result"].get("improvements", []))
        metrics["end_time"] = datetime.now().isoformat()
    
    callback_context.state["metrics"] = metrics


# --- Custom Agent for Validation ---
class QueryValidator(BaseAgent):
    """Validates optimized queries and provides feedback"""
    
    def __init__(self, name: str):
        super().__init__(name=name)
    
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        optimization_result = ctx.session.state.get("optimization_result")
        
        if not optimization_result:
            logger.warning(f"[{self.name}] No optimization result found")
            yield Event(author=self.name, actions=EventActions(escalate=False))
            return
        
        # Handle both string and dict responses
        if isinstance(optimization_result, str):
            # For string responses, do basic validation
            is_valid = "SELECT" in optimization_result.upper() and "FROM" in optimization_result.upper()
            logger.info(f"[{self.name}] String response validation. Valid: {is_valid}")
        elif isinstance(optimization_result, dict):
            optimized_query = optimization_result.get("optimized_query", "")
            
            # Basic SQL validation (in production, use proper SQL parser)
            is_valid = True
            syntax_errors = []
            
            # Check for common SQL keywords
            required_keywords = ["SELECT", "FROM"]
            query_upper = optimized_query.upper()
            
            for keyword in required_keywords:
                if keyword not in query_upper and query_upper.startswith("SELECT"):
                    syntax_errors.append(f"Missing {keyword} keyword")
                    is_valid = False
            
            # Check for balanced parentheses
            if optimized_query.count("(") != optimized_query.count(")"):
                syntax_errors.append("Unbalanced parentheses")
                is_valid = False
            
            validation_result = {
                "is_valid": is_valid,
                "syntax_errors": syntax_errors,
                "semantic_issues": [],
                "suggestions": []
            }
            
            # Add suggestions based on the query
            if "SELECT *" in query_upper:
                validation_result["suggestions"].append("Consider specifying exact columns instead of SELECT *")
            
            if "LIMIT" not in query_upper and "GROUP BY" not in query_upper:
                validation_result["suggestions"].append("Consider adding LIMIT clause for testing")
            
            ctx.session.state["validation_result"] = validation_result
            
            logger.info(f"[{self.name}] Validation complete. Valid: {is_valid}")
        else:
            # Default to valid for other types
            is_valid = True
            logger.info(f"[{self.name}] Unknown response type, defaulting to valid")
        
        # Escalate to stop if valid, continue if not
        yield Event(
            author=self.name, 
            actions=EventActions(escalate=is_valid)
        )


# --- Custom callback to emit detailed events ---
def emit_analysis_event_callback(callback_context: CallbackContext) -> None:
    """Emit detailed analysis event after query analyzer runs"""
    session = callback_context._invocation_context.session
    
    if "query_analysis" in session.state:
        analysis = session.state["query_analysis"]
        
        # Handle both string and dict responses
        if isinstance(analysis, str):
            logger.info(f"[Query Analyzer] Analysis complete. Output length: {len(analysis)} chars")
        elif isinstance(analysis, dict):
            # Create detailed status message
            status_msg = f"""
📊 **Query Analysis Complete**
- Query Type: {analysis.get('query_type', 'unknown')}
- Complexity: {analysis.get('estimated_complexity', 'unknown')}
- Tables: {', '.join(analysis.get('tables_involved', []))}
- Has JOINs: {analysis.get('has_joins', False)}
- Has Subqueries: {analysis.get('has_subqueries', False)}
- Initial Issues: {len(analysis.get('initial_issues', []))} found
"""
            logger.info(f"[Query Analyzer] {status_msg}")
        else:
            logger.info(f"[Query Analyzer] Analysis complete")


def emit_plan_event_callback(callback_context: CallbackContext) -> None:
    """Emit detailed planning event"""
    session = callback_context._invocation_context.session
    
    if "optimization_plan" in session.state:
        plan = session.state["optimization_plan"]
        
        # Handle both string and dict responses
        if isinstance(plan, str):
            logger.info(f"[Optimization Planner] Plan created. Output length: {len(plan)} chars")
        elif isinstance(plan, dict):
            status_msg = f"""
📋 **Optimization Plan Created**
- Priority: {plan.get('priority', 'balanced')}
- Goals: {len(plan.get('optimization_goals', []))} objectives
- Techniques: {', '.join(plan.get('techniques_to_apply', [])[:3])}...
"""
            logger.info(f"[Optimization Planner] {status_msg}")
        else:
            logger.info(f"[Optimization Planner] Plan created")


def emit_optimization_event_callback(callback_context: CallbackContext) -> None:
    """Emit detailed optimization event"""
    session = callback_context._invocation_context.session
    
    if "optimization_result" in session.state:
        result = session.state["optimization_result"]
        
        # Handle both string and dict responses
        if isinstance(result, str):
            logger.info(f"[Query Optimizer] Optimization complete. Output length: {len(result)} chars")
        elif isinstance(result, dict):
            status_msg = f"""
🔧 **Query Optimization Complete**
- Improvements Applied: {len(result.get('improvements', []))}
- Performance Gain: {result.get('estimated_performance_gain', 'calculating...')}
- Cost Reduction: {result.get('estimated_cost_reduction', 'calculating...')}
"""
            logger.info(f"[Query Optimizer] {status_msg}")
        else:
            logger.info(f"[Query Optimizer] Optimization complete")


# --- AGENT DEFINITIONS ---

# 1. Query Analyzer Agent with detailed output
query_analyzer = LlmAgent(
    model="gemini-2.5-flash",
    name="query_analyzer",
    description="Analyzes the BigQuery SQL query to understand its structure and complexity",
    instruction=f"""
    You are a BigQuery SQL analysis expert. Your job is to analyze the given SQL query and identify:
    
    1. The type of query (SELECT, INSERT, UPDATE, etc.)
    2. Complexity level (low, medium, high)
    3. Tables involved
    4. Presence of JOINs, subqueries, aggregations
    5. Any obvious issues or anti-patterns
    
    IMPORTANT: Output ONLY the JSON data, no explanatory text.
    
    Analyze the query thoroughly and provide structured output.
    
    Project: {PROJECT_ID}
    Dataset: {DATASET}
    Current date: {datetime.now().strftime("%Y-%m-%d")}
    
    Provide a detailed analysis and include key findings.
    Output your analysis in a clear, structured format.
    """,
    output_key="query_analysis",
    after_agent_callback=emit_analysis_event_callback
)

# 2. Optimization Planner Agent with callbacks
optimization_planner = LlmAgent(
    model="gemini-2.5-flash",
    name="optimization_planner",
    description="Creates an optimization plan based on the query analysis",
    instruction=f"""
    You are a BigQuery optimization strategist. Based on the query analysis in 'query_analysis',
    create a detailed optimization plan.
    
    Consider these optimization techniques:
    - Partition pruning (using _PARTITIONTIME or date columns)
    - Clustering benefits
    - JOIN optimization (broadcast joins, join order)
    - Subquery elimination (using CTEs or window functions)
    - Aggregation pushdown
    - SELECT * elimination
    - LIMIT clause addition
    - Index usage (for external tables)
    - Materialized views or table snapshots
    
    Prioritize based on:
    - Performance: Focus on query execution speed
    - Cost: Focus on reducing bytes processed
    - Balanced: Balance both performance and cost
    
    Provide a comprehensive optimization plan with clear explanations.
    Include all optimization strategies and their rationale.
    """,
    output_key="optimization_plan",
    after_agent_callback=emit_plan_event_callback
)

# 3. Query Optimizer Agent with detailed processing
query_optimizer = LlmAgent(
    model="gemini-2.5-flash",
    name="query_optimizer",
    description="Applies optimization techniques to rewrite the query",
    instruction=f"""
    You are a BigQuery SQL optimization expert. Your task is to:
    
    1. Take the original query from the user input
    2. Apply the optimization plan from 'optimization_plan'
    3. Rewrite the query with all optimizations applied
    4. Document each improvement made
    5. Estimate performance gains and cost reductions
    
    Optimization rules:
    - Replace SELECT * with specific columns
    - Add partition filters where applicable
    - Convert subqueries to CTEs for better readability
    - Optimize JOIN order (smaller tables first)
    - Add LIMIT for non-aggregation queries
    - Use APPROX functions where exact results aren't needed
    - Apply clustering benefits by filtering on clustered columns
    
    BigQuery-specific optimizations:
    - Use PARTITIONTIME pseudo column for partitioned tables
    - Leverage INFORMATION_SCHEMA for metadata queries
    - Use scripting for complex multi-step operations
    - Apply cost-based optimization hints
    
    Show the step-by-step optimization process.
    Explain each optimization and provide the final optimized query.
    Include performance improvement estimates.
    """,
    output_key="optimization_result",
    after_agent_callback=emit_optimization_event_callback
)

# Create metadata fetching tool
def fetch_table_metadata(table_name: str) -> Dict[str, Any]:
    """Fetch BigQuery table metadata including schema and partitioning info"""
    logger.info(f"🔍 Fetching metadata for table: {table_name}")
    
    # Simulate metadata fetching (in production, use BigQuery client)
    metadata = {
        "table": table_name,
        "project": PROJECT_ID,
        "dataset": DATASET,
        "schema": [
            {"name": "id", "type": "STRING", "mode": "REQUIRED"},
            {"name": "timestamp", "type": "TIMESTAMP", "mode": "REQUIRED"},
            {"name": "user_id", "type": "STRING", "mode": "NULLABLE"},
            {"name": "event_type", "type": "STRING", "mode": "NULLABLE"},
            {"name": "properties", "type": "JSON", "mode": "NULLABLE"}
        ],
        "partitioning": {
            "type": "DAY",
            "field": "timestamp"
        },
        "clustering": {
            "fields": ["user_id", "event_type"]
        },
        "estimated_size_gb": 1250,
        "estimated_rows": 1_500_000_000,
        "last_modified": datetime.now().isoformat()
    }
    
    logger.info(f"📊 Table {table_name}: {metadata['estimated_rows']:,} rows, "
                f"{metadata['estimated_size_gb']} GB, "
                f"Partitioned by {metadata['partitioning']['field']}")
    
    return metadata

metadata_tool = FunctionTool(
    func=fetch_table_metadata
)

# 4. Schema-aware Analyzer Agent
schema_analyzer = LlmAgent(
    model="gemini-2.5-flash",
    name="schema_analyzer",
    description="Analyzes table schemas and metadata for optimization opportunities",
    instruction=f"""
    You are a BigQuery schema and metadata expert.
    
    Based on the query analysis, fetch metadata for all tables involved using the fetch_table_metadata tool.
    
    Analyze:
    1. Table schemas and data types
    2. Partitioning configuration
    3. Clustering configuration
    4. Table sizes and row counts
    5. Optimization opportunities based on schema
    
    Provide detailed insights about how the schema can be leveraged for optimization.
    
    Project: {PROJECT_ID}
    Dataset: {DATASET}
    """,
    tools=[metadata_tool],
    output_key="schema_analysis"
)

# 5. Result Formatter Agent
result_formatter = LlmAgent(
    model="gemini-2.5-flash",
    name="result_formatter",
    description="Formats the final optimization results for presentation",
    instruction="""
    You are a technical writer specializing in SQL optimization reports.
    
    Based on all the analysis and optimization data in the session state, create a comprehensive,
    well-formatted report that includes:
    
    1. **Original Query Analysis**
       - Complexity assessment
       - Issues identified
    
    2. **Optimization Strategy**
       - Goals and priorities
       - Techniques applied
    
    3. **Optimized Query**
       - The rewritten query with syntax highlighting hints
       - Side-by-side comparison if helpful
    
    4. **Performance Improvements**
       - Estimated performance gains
       - Cost reduction estimates
       - Specific improvements made
    
    5. **Additional Recommendations**
       - Further optimization opportunities
       - Best practices reminders
       - Monitoring suggestions
    
    6. **Metrics Summary**
       - Processing time
       - Complexity reduction
       - Table access patterns
    
    Format the output in clear Markdown with proper sections, code blocks, and bullet points.
    Make it easy to read and actionable.
    """,
    output_key="final_report"
)

# Create a separate optimizer for the validation loop
query_reoptimizer = LlmAgent(
    model="gemini-2.5-flash",
    name="query_reoptimizer",
    description="Re-optimizes queries that failed validation",
    instruction=f"""
    You are a BigQuery SQL optimization expert. The previous optimization failed validation.
    
    Review the validation feedback in 'validation_result' and re-optimize the query.
    Fix any syntax errors and semantic issues identified.
    
    Provide clear feedback on the optimization.
    Show what was fixed and improved.
    """,
    output_key="optimization_result"
)

# --- Optimization Pipeline with Schema Analysis ---
optimization_pipeline = SequentialAgent(
    name="optimization_pipeline",
    description="Complete BigQuery query optimization pipeline with metadata analysis",
    sub_agents=[
        query_analyzer,
        schema_analyzer,  # New: Fetch and analyze table metadata
        optimization_planner,
        query_optimizer,
        LoopAgent(
            name="validation_loop",
            max_iterations=2,
            sub_agents=[
                QueryValidator(name="query_validator"),
                query_reoptimizer  # Use separate reoptimizer agent
            ]
        ),
        result_formatter
    ]
)

# --- Main Orchestrator Agent ---
bigquery_optimizer_orchestrator = LlmAgent(
    name="bigquery_optimizer_orchestrator",
    model="gemini-2.5-flash",
    description="Main orchestrator for BigQuery query optimization",
    instruction=f"""
    You are the main orchestrator for BigQuery query optimization.
    
    Your workflow:
    1. Extract the SQL query from the user's message (might be in JSON format)
    2. Validate that it's a proper SQL query
    3. Delegate to the optimization_pipeline for full analysis and optimization
    4. Present the results in a clear, actionable format
    
    If the user doesn't provide a valid query, ask them to provide one.
    
    For any query provided, immediately delegate to the optimization_pipeline using the agent tool.
    
    Current configuration:
    - Project: {PROJECT_ID}
    - Dataset: {DATASET}
    - Location: {LOCATION}
    - Date: {datetime.now().strftime("%Y-%m-%d")}
    """,
    sub_agents=[optimization_pipeline],
    tools=[AgentTool(optimization_pipeline)]
)

# Export the root agent
root_agent = bigquery_optimizer_orchestrator

# For backwards compatibility
__all__ = ["root_agent"]