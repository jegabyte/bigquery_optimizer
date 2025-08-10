"""
Streaming Callbacks for Agents
Handles streaming output to frontend via SSE with enhanced logging
"""

import json
import logging
from datetime import datetime
from google.adk.agents.callback_context import CallbackContext

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from app.tracing import add_trace_event, set_trace_attribute

def create_streaming_callback(agent_name: str, stage_message: str, output_key: str):
    """Creates a streaming callback for a specific agent with enhanced logging and tracing"""
    def callback(callback_context: CallbackContext) -> None:
        """Streams output immediately after agent completes with detailed logging"""
        session = callback_context._invocation_context.session
        
        # Add trace event for stage completion
        add_trace_event(f"Stage completed: {agent_name}", {
            "stage.name": agent_name,
            "stage.message": stage_message,
            "stage.output_key": output_key
        })
        
        # Enhanced logging for debugging
        logger.info(f"=" * 60)
        logger.info(f"📍 CALLBACK TRIGGERED: {agent_name}")
        logger.info(f"=" * 60)
        
        # Log session state keys
        logger.info(f"Session state keys: {list(session.state.keys())}")
        
        # Log events count
        logger.info(f"Total events in session: {len(session.events) if hasattr(session, 'events') else 'N/A'}")
        
        # Create a stage output
        stage_output = {
            "stage": agent_name,
            "timestamp": datetime.now().isoformat(),
            "status": "completed",
            "message": stage_message
        }
        
        # Get the output from the session state
        if output_key in session.state:
            stage_output["type"] = agent_name.replace("_", "-")
            raw_output = session.state[output_key]
            
            logger.info(f"✅ Output found for key '{output_key}'")
            logger.info(f"Output type: {type(raw_output)}")
            
            # Log first 500 chars of output
            if isinstance(raw_output, str):
                logger.info(f"Output preview (first 500 chars): {raw_output[:500]}")
            else:
                logger.info(f"Output (non-string): {str(raw_output)[:500]}")
            
            # Try to clean up JSON output from all agents
            if isinstance(raw_output, str):
                output_text = raw_output.strip()
                
                # Remove markdown code block wrapper if present
                if output_text.startswith('```json'):
                    output_text = output_text[7:]  # Remove ```json
                    logger.info("Removed ```json prefix")
                if output_text.endswith('```'):
                    output_text = output_text[:-3]  # Remove ```
                    logger.info("Removed ``` suffix")
                output_text = output_text.strip()
                
                try:
                    # Try to parse as JSON
                    data = json.loads(output_text)
                    # Update session state with clean JSON
                    session.state[output_key] = data  # Store as dict, not string
                    stage_output["data"] = data  # Add parsed data to stage output
                    
                    logger.info(f"✅ JSON parsed successfully for {agent_name}")
                    logger.info(f"Parsed data keys: {list(data.keys()) if isinstance(data, dict) else 'not a dict'}")
                    
                    # Log specific details based on agent and add to trace
                    if agent_name == "metadata_extractor" and isinstance(data, dict):
                        tables_found = data.get('tables_found', 0)
                        total_size = data.get('total_size_gb', 0)
                        logger.info(f"  - Tables found: {tables_found}")
                        logger.info(f"  - Total size: {total_size} GB")
                        set_trace_attribute(f"{agent_name}.tables_found", tables_found)
                        set_trace_attribute(f"{agent_name}.total_size_gb", total_size)
                    elif agent_name == "rule_checker" and isinstance(data, dict):
                        rules_checked = data.get('rules_checked', 0)
                        violations = data.get('violations_found', 0)
                        logger.info(f"  - Rules checked: {rules_checked}")
                        logger.info(f"  - Violations: {violations}")
                        set_trace_attribute(f"{agent_name}.rules_checked", rules_checked)
                        set_trace_attribute(f"{agent_name}.violations_found", violations)
                    elif agent_name == "query_optimizer" and isinstance(data, dict):
                        optimizations = data.get('total_optimizations', 0)
                        logger.info(f"  - Optimizations: {optimizations}")
                        set_trace_attribute(f"{agent_name}.total_optimizations", optimizations)
                    elif agent_name == "final_reporter" and isinstance(data, dict):
                        exec_summary = data.get('executive_summary', {})
                        cost_reduction = exec_summary.get('cost_reduction', 'N/A')
                        logger.info(f"  - Cost reduction: {cost_reduction}")
                        set_trace_attribute(f"{agent_name}.cost_reduction", str(cost_reduction))
                        
                except json.JSONDecodeError as e:
                    logger.warning(f"⚠️ Could not parse JSON from {agent_name}: {e}")
                    logger.warning(f"Raw text (first 200 chars): {output_text[:200]}")
                    stage_output["data"] = raw_output  # Use raw text if parsing fails
            else:
                stage_output["data"] = raw_output
                logger.info(f"Output is already non-string type: {type(raw_output)}")
            
            # Log the final stage output
            logger.info(f"📤 Stage output prepared for streaming")
            logger.info(f"Stage output keys: {list(stage_output.keys())}")
            
        else:
            logger.warning(f"❌ No output found for {agent_name} with key '{output_key}'")
            logger.warning(f"Available keys in session.state: {list(session.state.keys())}")
        
        logger.info(f"{'=' * 60}\n")
    
    return callback

def create_event_logger_callback(agent_name: str):
    """Creates a callback that logs all events for debugging"""
    def callback(callback_context: CallbackContext) -> None:
        session = callback_context._invocation_context.session
        logger.info(f"📊 EVENT LOGGER for {agent_name}")
        
        if hasattr(session, 'events'):
            for i, event in enumerate(session.events[-5:]):  # Last 5 events
                logger.info(f"  Event {i}: Type={getattr(event, 'type', 'unknown')}, "
                          f"Has content={hasattr(event, 'content')}")
                if hasattr(event, 'content'):
                    content_str = str(event.content)[:100]
                    logger.info(f"    Content preview: {content_str}")
    
    return callback