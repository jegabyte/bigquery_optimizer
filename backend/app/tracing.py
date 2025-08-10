"""
OpenTelemetry Tracing Configuration for BigQuery Optimizer
Provides custom span naming and attributes for better trace visibility
"""

import os
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource
from functools import wraps
import json
import hashlib
from datetime import datetime

# Initialize tracer only if tracing is enabled
TRACE_ENABLED = os.getenv("ADK_TRACE_TO_CLOUD", "false").lower() == "true"
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "aiva-e74f3")

if TRACE_ENABLED:
    # Create resource with service information
    resource = Resource.create({
        "service.name": "bigquery-optimizer",
        "service.version": "1.0.0",
        "service.namespace": "adk-agents",
        "deployment.environment": os.getenv("ENVIRONMENT", "development"),
        "cloud.provider": "gcp",
        "cloud.account.id": PROJECT_ID,
    })
    
    # Set up the tracer provider with Cloud Trace exporter
    provider = TracerProvider(resource=resource)
    cloud_trace_exporter = CloudTraceSpanExporter(project_id=PROJECT_ID)
    provider.add_span_processor(
        BatchSpanProcessor(cloud_trace_exporter)
    )
    trace.set_tracer_provider(provider)
    
    # Get tracer for our application
    tracer = trace.get_tracer("bigquery-optimizer", "1.0.0")
else:
    tracer = None

def create_query_fingerprint(query: str) -> str:
    """Create a short fingerprint for a query to use as trace identifier"""
    # Remove whitespace and lowercase for consistent hashing
    normalized = " ".join(query.lower().split())
    # Create a short hash
    return hashlib.md5(normalized.encode()).hexdigest()[:8]

def trace_agent(agent_name: str, stage_num: int = None):
    """
    Decorator to add tracing to agent functions
    
    Args:
        agent_name: Name of the agent (e.g., "metadata_extractor")
        stage_num: Stage number in the pipeline (1-4)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not TRACE_ENABLED or not tracer:
                return func(*args, **kwargs)
            
            # Create span name with stage number if provided
            span_name = f"Stage{stage_num}_{agent_name}" if stage_num else agent_name
            
            with tracer.start_as_current_span(span_name) as span:
                try:
                    # Add common attributes
                    span.set_attribute("agent.name", agent_name)
                    span.set_attribute("agent.type", "adk_agent")
                    if stage_num:
                        span.set_attribute("pipeline.stage", stage_num)
                        span.set_attribute("pipeline.stage_name", agent_name)
                    
                    # Extract query from arguments if available
                    if 'query' in kwargs:
                        query = kwargs['query']
                        span.set_attribute("query.original", query[:500])  # Truncate long queries
                        span.set_attribute("query.fingerprint", create_query_fingerprint(query))
                        span.set_attribute("query.length", len(query))
                    
                    # Execute the function
                    result = func(*args, **kwargs)
                    
                    # Add result attributes
                    if result:
                        if isinstance(result, dict):
                            span.set_attribute("result.type", "dict")
                            span.set_attribute("result.keys", ",".join(result.keys()))
                            
                            # Agent-specific attributes
                            if agent_name == "metadata_extractor" and "tables_found" in result:
                                span.set_attribute("metadata.tables_count", result["tables_found"])
                                span.set_attribute("metadata.total_size_gb", result.get("total_size_gb", 0))
                            
                            elif agent_name == "rule_checker" and "violations_found" in result:
                                span.set_attribute("rules.violations_count", result["violations_found"])
                                span.set_attribute("rules.rules_checked", result.get("rules_checked", 0))
                            
                            elif agent_name == "query_optimizer" and "total_optimizations" in result:
                                span.set_attribute("optimizer.optimizations_count", result["total_optimizations"])
                                span.set_attribute("optimizer.optimized", result.get("optimization_applied", False))
                            
                            elif agent_name == "final_reporter":
                                if "executive_summary" in result:
                                    summary = result["executive_summary"]
                                    span.set_attribute("report.cost_reduction", summary.get("cost_reduction", "N/A"))
                                    span.set_attribute("report.performance_gain", summary.get("performance_gain", "N/A"))
                        else:
                            span.set_attribute("result.type", type(result).__name__)
                    
                    span.set_status(Status(StatusCode.OK))
                    return result
                    
                except Exception as e:
                    # Record the error
                    span.record_exception(e)
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.set_attribute("error.type", type(e).__name__)
                    span.set_attribute("error.message", str(e))
                    raise
        
        return wrapper
    return decorator

def create_optimization_trace(query: str, session_id: str = None):
    """
    Create a parent trace for the entire optimization process
    
    Args:
        query: The SQL query being optimized
        session_id: Optional session identifier
    
    Returns:
        A context manager for the trace span
    """
    if not TRACE_ENABLED or not tracer:
        # Return a no-op context manager
        class NoOpContext:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def set_attribute(self, *args): pass
        return NoOpContext()
    
    # Create a unique trace name
    query_fingerprint = create_query_fingerprint(query)
    trace_name = f"optimize_query_{query_fingerprint}"
    
    span = tracer.start_span(trace_name)
    
    # Add attributes
    span.set_attribute("service.name", "bigquery-optimizer")
    span.set_attribute("optimization.query", query[:1000])  # Truncate long queries
    span.set_attribute("optimization.query_fingerprint", query_fingerprint)
    span.set_attribute("optimization.timestamp", datetime.now().isoformat())
    
    if session_id:
        span.set_attribute("session.id", session_id)
    
    # Add query characteristics
    query_lower = query.lower()
    span.set_attribute("query.has_select_star", "*" in query)
    span.set_attribute("query.has_limit", "limit" in query_lower)
    span.set_attribute("query.has_where", "where" in query_lower)
    span.set_attribute("query.has_join", "join" in query_lower)
    span.set_attribute("query.has_group_by", "group by" in query_lower)
    span.set_attribute("query.has_order_by", "order by" in query_lower)
    
    return span

def add_trace_event(message: str, attributes: dict = None):
    """
    Add an event to the current span
    
    Args:
        message: Event message
        attributes: Optional attributes for the event
    """
    if not TRACE_ENABLED:
        return
    
    current_span = trace.get_current_span()
    if current_span:
        event_attributes = {"event.message": message}
        if attributes:
            event_attributes.update(attributes)
        current_span.add_event(message, attributes=event_attributes)

def set_trace_attribute(key: str, value):
    """
    Set an attribute on the current span
    
    Args:
        key: Attribute key
        value: Attribute value
    """
    if not TRACE_ENABLED:
        return
    
    current_span = trace.get_current_span()
    if current_span:
        current_span.set_attribute(key, value)