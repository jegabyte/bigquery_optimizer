"""
Centralized logging configuration for Backend API
Provides detailed error logging and debugging information
"""

import logging
import sys
import json
from datetime import datetime
from typing import Any, Dict
import traceback

class DetailedFormatter(logging.Formatter):
    """Custom formatter that includes detailed error information"""
    
    def format(self, record):
        # Add extra context if available
        if hasattr(record, 'exc_info') and record.exc_info:
            record.exc_text = self.formatException(record.exc_info)
        
        # Format timestamp
        record.timestamp = datetime.utcnow().isoformat()
        
        # Create structured log
        log_data = {
            'timestamp': record.timestamp,
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # Add exception details if present
        if record.exc_info:
            log_data['exception'] = {
                'type': record.exc_info[0].__name__,
                'message': str(record.exc_info[1]),
                'traceback': traceback.format_exception(*record.exc_info)
            }
        
        # Add extra fields if present
        if hasattr(record, 'extra_data'):
            log_data['extra'] = record.extra_data
            
        return json.dumps(log_data, default=str)

def setup_logging(log_level: str = "INFO", log_format: str = "detailed"):
    """
    Setup comprehensive logging for the application
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_format: Format type ('detailed' for JSON, 'simple' for text)
    """
    # Clear existing handlers
    logging.getLogger().handlers.clear()
    
    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    
    # Set format based on preference
    if log_format == "detailed":
        formatter = DetailedFormatter()
    else:
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    console_handler.setFormatter(formatter)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    root_logger.addHandler(console_handler)
    
    # Configure specific loggers
    loggers_config = {
        'uvicorn': logging.INFO,
        'uvicorn.error': logging.ERROR,
        'uvicorn.access': logging.WARNING,  # Reduce access log verbosity
        'fastapi': logging.INFO,
        'backend_api': logging.DEBUG if log_level == "DEBUG" else logging.INFO,
        'google': logging.WARNING,  # Reduce Google client library logs
        'firestore_service': logging.INFO,
        'bigquery_rules': logging.INFO
    }
    
    for logger_name, level in loggers_config.items():
        logger = logging.getLogger(logger_name)
        logger.setLevel(level)
    
    # Log startup message
    logging.info(f"Logging configured: level={log_level}, format={log_format}")

def log_error_with_context(logger: logging.Logger, error: Exception, context: Dict[str, Any] = None):
    """
    Log an error with full context and traceback
    
    Args:
        logger: Logger instance
        error: Exception to log
        context: Additional context information
    """
    error_details = {
        'error_type': type(error).__name__,
        'error_message': str(error),
        'traceback': traceback.format_exc(),
        'context': context or {}
    }
    
    logger.error(
        f"Error occurred: {error}",
        exc_info=True,
        extra={'extra_data': error_details}
    )

def create_module_logger(module_name: str) -> logging.Logger:
    """
    Create a logger for a specific module with proper naming
    
    Args:
        module_name: Name of the module
        
    Returns:
        Configured logger instance
    """
    return logging.getLogger(f"backend_api.{module_name}")