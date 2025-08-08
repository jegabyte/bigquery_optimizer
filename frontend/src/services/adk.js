/**
 * ADK Service for connecting to the backend ADK API
 * Handles streaming responses from the ADK server
 */

// Use proxy path instead of direct URL to avoid CORS issues
const ADK_BASE_URL = '/api';

/**
 * Parse streaming JSON responses from ADK
 */
function parseStreamingResponse(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const results = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        results.push(data);
      } catch (e) {
        console.warn('Failed to parse streaming data:', line);
      }
    }
  }
  
  return results;
}

/**
 * Create a session for ADK
 */
async function createSession(sessionId, userId) {
  const response = await fetch(`${ADK_BASE_URL}/apps/app/users/${userId}/sessions/${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Optimize query using ADK backend
 */
export async function optimizeQueryWithADK(query, options = {}) {
  try {
    // Use ADK run_sse endpoint with correct format
    const sessionId = options.sessionId || `session_${Date.now()}`;
    const userId = options.userId || 'u_default';
    
    // Create session first
    try {
      await createSession(sessionId, userId);
      console.log('Session created:', sessionId);
    } catch (error) {
      console.warn('Session creation failed, continuing anyway:', error);
    }
    
    // Format the query with metadata as a JSON string in the message
    const messageContent = JSON.stringify({
      query: query,
      project_id: options.projectId || 'aiva-e74f3',
      dataset_id: options.datasetId || 'analytics',
      validate: options.validate !== false
    });
    
    const response = await fetch(`${ADK_BASE_URL}/run_sse`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appName: 'app',
        userId: userId,
        sessionId: sessionId,
        newMessage: {
          parts: [
            {
              text: messageContent
            }
          ],
          role: 'user'
        },
        streaming: true
      })
    });

    if (!response.ok) {
      throw new Error(`ADK request failed: ${response.statusText}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            events.push(data);
            
            // Call progress callback if provided
            if (options.onProgress) {
              options.onProgress(data);
            }
          } catch (e) {
            console.warn('Failed to parse event:', line);
          }
        }
      }
    }
    
    // Find the final result
    const finalEvent = events.find(e => e.type === 'agent' && e.data?.output);
    if (finalEvent && finalEvent.data.output) {
      return parseADKResponse(finalEvent.data.output);
    }
    
    // Fallback: return last event with data
    const lastDataEvent = [...events].reverse().find(e => e.data);
    if (lastDataEvent) {
      return parseADKResponse(lastDataEvent.data);
    }
    
    throw new Error('No valid response received from ADK');
    
  } catch (error) {
    console.error('ADK optimization error:', error);
    
    // Fallback to mock service if ADK is not available
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.warn('ADK backend not available, falling back to mock service');
      const { mockOptimizationService } = await import('./mockData.js');
      return await mockOptimizationService.optimizeQuery(query);
    }
    
    throw error;
  }
}

/**
 * Parse ADK response into our expected format
 */
function parseADKResponse(output) {
  // If output is already in the expected format
  if (output.optimized_query || output.optimizedQuery) {
    return {
      originalQuery: output.original_query || output.originalQuery || output.query,
      optimizedQuery: output.optimized_query || output.optimizedQuery,
      issues: output.issues || [],
      suggestions: output.suggestions || [],
      validationResult: output.validation_result || output.validationResult || null,
      metadata: output.metadata || {}
    };
  }
  
  // If output is a string (LLM response), parse it
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      return parseADKResponse(parsed);
    } catch {
      // If it's not JSON, create a basic response
      return {
        originalQuery: '',
        optimizedQuery: output,
        issues: [],
        suggestions: ['Query optimization completed'],
        validationResult: null,
        metadata: {}
      };
    }
  }
  
  // Default structure
  return {
    originalQuery: output.query || '',
    optimizedQuery: output.optimized || '',
    issues: output.issues || [],
    suggestions: output.suggestions || [],
    validationResult: output.validation || null,
    metadata: output.metadata || {}
  };
}

/**
 * Test ADK connection
 */
export async function testADKConnection() {
  try {
    // Check if ADK server is running using docs endpoint like reference app
    const response = await fetch(`${ADK_BASE_URL}/docs`, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/json'
      }
    });
    
    // If we get any successful response, the server is running
    return response.ok || response.status === 200;
  } catch (error) {
    // Network error means server is not running
    console.log('ADK connection test failed:', error.message);
    return false;
  }
}

/**
 * Get ADK server status
 */
export async function getADKStatus() {
  try {
    // Since ADK doesn't have a status endpoint, we'll just check if it's reachable
    const isConnected = await testADKConnection();
    
    if (isConnected) {
      return {
        connected: true,
        message: 'ADK API Server is running',
        status: 'healthy'
      };
    }
    
    return { connected: false };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

/**
 * Stream query optimization with progress updates
 */
export async function streamQueryOptimization(query, onProgress, options = {}) {
  const events = [];
  
  const result = await optimizeQueryWithADK(query, {
    ...options,
    onProgress: (event) => {
      events.push(event);
      
      // Parse progress from event
      if (event.type === 'agent' && event.data) {
        if (event.data.state === 'streaming') {
          onProgress({
            stage: 'processing',
            message: 'Analyzing query...',
            progress: 25
          });
        } else if (event.data.output) {
          onProgress({
            stage: 'complete',
            message: 'Optimization complete',
            progress: 100
          });
        }
      } else if (event.type === 'error') {
        onProgress({
          stage: 'error',
          message: event.data?.message || 'An error occurred',
          progress: 0
        });
      }
    }
  });
  
  return { result, events };
}