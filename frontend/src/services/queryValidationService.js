/**
 * Query Validation Service
 * Validates BigQuery queries before submission to the agent API
 */

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8001';

/**
 * Validate a BigQuery SQL query
 * @param {string} query - The SQL query to validate
 * @param {string} projectId - The Google Cloud project ID (optional)
 * @returns {Promise<Object>} Validation result
 */
export async function validateQuery(query, projectId = null) {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/query/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        project_id: projectId
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      return {
        valid: false,
        error: result.detail || 'Query validation failed',
        error_type: 'VALIDATION_ERROR'
      };
    }

    return result;
  } catch (error) {
    console.error('Query validation error:', error);
    return {
      valid: false,
      error: 'Failed to validate query. Please check your connection.',
      error_type: 'NETWORK_ERROR'
    };
  }
}

/**
 * Format error message for display
 * @param {string} errorMessage - Raw error message from BigQuery
 * @returns {string} Formatted error message
 */
export function formatErrorMessage(errorMessage) {
  // Extract the main error message
  if (errorMessage.includes('Not found:')) {
    const match = errorMessage.match(/Not found: (.*?)(?:\n|$)/);
    if (match) {
      return `Table or dataset not found: ${match[1]}`;
    }
  }
  
  if (errorMessage.includes('Syntax error:')) {
    const match = errorMessage.match(/Syntax error: (.*?)(?:\n|$)/);
    if (match) {
      return `SQL syntax error: ${match[1]}`;
    }
  }
  
  if (errorMessage.includes('Access Denied') || errorMessage.includes('Permission')) {
    return 'Permission denied. Please check your access to the specified resources.';
  }
  
  // Remove stack traces and technical details
  const lines = errorMessage.split('\n');
  const mainError = lines[0];
  
  // Remove HTTP status codes
  const cleanedError = mainError.replace(/^\d{3}\s+\w+\s+/, '');
  
  return cleanedError || 'Query validation failed';
}

/**
 * Get error type display name
 * @param {string} errorType - Error type from backend
 * @returns {string} Human-readable error type
 */
export function getErrorTypeDisplay(errorType) {
  const errorTypeMap = {
    'TABLE_NOT_FOUND': 'Resource Not Found',
    'SYNTAX_ERROR': 'SQL Syntax Error',
    'PERMISSION_DENIED': 'Access Denied',
    'RESOURCE_EXCEEDED': 'Resource Limit Exceeded',
    'VALIDATION_ERROR': 'Validation Error',
    'NETWORK_ERROR': 'Connection Error',
    'EMPTY_QUERY': 'Empty Query'
  };
  
  return errorTypeMap[errorType] || 'Query Error';
}