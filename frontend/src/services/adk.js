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
            
            // Enhanced logging for debugging
            if (data.content?.parts?.[0]?.text) {
              const text = data.content.parts[0].text;
              console.log(`Event from ${data.author}:`, text.substring(0, 100));
              
              // Check if this looks like metadata output
              if (text.includes('tables_found') || text.includes('total_size_gb') || text.includes('column_names')) {
                console.log('METADATA DETECTED in event from', data.author, '- Full text:', text.substring(0, 500));
              }
              
              console.log('Full event structure:', {
                author: data.author,
                role: data.content?.role,
                hasPartial: data.partial,
                textLength: text.length,
                firstChars: text.substring(0, 200)
              });
            }
            
            // Check if this is a complete stage output or accumulate partial data
            if (data.content?.parts?.[0]?.text) {
              const text = data.content.parts[0].text;
              const author = data.author;
              
              // Initialize accumulator for this author if needed
              if (!window._stageAccumulator) {
                window._stageAccumulator = {};
              }
              
              // For metadata_extractor, accumulate the text until we have complete JSON
              if (author === 'metadata_extractor') {
                if (!window._stageAccumulator[author]) {
                  window._stageAccumulator[author] = '';
                }
                window._stageAccumulator[author] += text;
                
                // Check if we have complete JSON now
                const accumulated = window._stageAccumulator[author];
                
                // Try to find complete JSON in accumulated text
                let jsonStr = null;
                
                // Look for complete JSON object (starts with { and ends with })
                const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  jsonStr = jsonMatch[0];
                  
                  // Verify it's complete by trying to parse
                  try {
                    const stageData = JSON.parse(jsonStr);
                    
                    // Check if this is metadata data
                    if (stageData.tables_found !== undefined || stageData.tables !== undefined || 
                        stageData.total_size_gb !== undefined || stageData.total_row_count !== undefined) {
                      console.log('Calling onStageComplete for metadata:', stageData);
                      if (options.onStageComplete) {
                        options.onStageComplete('metadata', stageData);
                      }
                      // Clear accumulator after successful parse
                      window._stageAccumulator[author] = '';
                    }
                  } catch (e) {
                    // Not complete JSON yet, continue accumulating
                  }
                }
              }
              
              // For other stages, use the original logic (they seem to work fine)
              if (!data.partial && author !== 'metadata_extractor') {
                try {
                  // Look for JSON in the text - try multiple patterns
                  let jsonStr = null;
                  let stageData = null;
                  
                  // Pattern 1: JSON in code blocks
                  const codeBlockMatch = text.match(/```json\n([\s\S]*?)\n```/);
                  if (codeBlockMatch) {
                    jsonStr = codeBlockMatch[1];
                  }
                  
                  // Pattern 2: Raw JSON object
                  if (!jsonStr) {
                    const jsonMatch = text.match(/\{[\s\S]*?\}/);
                    if (jsonMatch) {
                      jsonStr = jsonMatch[0];
                    }
                  }
                  
                  // Try to parse the JSON
                  if (jsonStr) {
                    try {
                      stageData = JSON.parse(jsonStr);
                      console.log(`Parsed stage data from ${author}:`, stageData);
                    } catch (e) {
                      console.warn('Failed to parse JSON from text:', e, 'Text:', jsonStr.substring(0, 200));
                    }
                  }
                  
                  // Call onStageComplete if this is a complete stage and we have stageData
                  if (stageData && options.onStageComplete) {
                    if ((author === 'rule_checker' || author === 'rule-checker') && 
                               (stageData.rules_checked !== undefined || stageData.violations !== undefined)) {
                      console.log('Calling onStageComplete for rules:', stageData);
                      options.onStageComplete('rules', stageData);
                    } else if ((author === 'query_optimizer' || author === 'query-optimizer') && 
                               (stageData.total_optimizations !== undefined || stageData.steps !== undefined)) {
                      console.log('Calling onStageComplete for optimization:', stageData);
                      options.onStageComplete('optimization', stageData);
                    } else if ((author === 'final_reporter' || author === 'final-reporter') && 
                               (stageData.executive_summary !== undefined || stageData.optimization_summary !== undefined)) {
                      console.log('Calling onStageComplete for report:', stageData);
                      options.onStageComplete('report', stageData);
                    }
                  }
                } catch (e) {
                  console.warn('Failed to parse stage JSON:', e);
                }
              }
            }
            
            // Call progress callback if provided with meaningful stage info
            if (options.onProgress) {
              // Map author to meaningful stage names
              let stageInfo = null;
              if (data.author === 'metadata_extractor') {
                stageInfo = {
                  stage: 'metadata',
                  message: 'Extracting table metadata...',
                  progress: 25
                };
              } else if (data.author === 'rule_checker') {
                stageInfo = {
                  stage: 'analysis',
                  message: 'Analyzing query patterns...',
                  progress: 50
                };
              } else if (data.author === 'query_optimizer') {
                stageInfo = {
                  stage: 'optimization',
                  message: 'Optimizing query...',
                  progress: 75
                };
              } else if (data.author === 'final_reporter') {
                stageInfo = {
                  stage: 'finalizing',
                  message: 'Generating final report...',
                  progress: 90
                };
              }
              
              if (stageInfo) {
                options.onProgress(stageInfo);
              } else {
                options.onProgress(data);
              }
            }
          } catch (e) {
            console.warn('Failed to parse event:', line);
          }
        }
      }
    }
    
    // Log events for debugging
    console.log('Total events received:', events.length);
    
    // Find events with content
    const contentEvents = events.filter(e => e.content?.parts?.[0]?.text || e.data?.output);
    console.log('Events with content:', contentEvents.length);
    
    // Try to parse from the new event structure
    if (contentEvents.length > 0) {
      const parsedResponse = parseADKResponse(null, events);
      console.log('Parsed response:', parsedResponse);
      
      // If we got a valid response, return it
      if (parsedResponse && (parsedResponse.optimizedQuery || parsedResponse.issues?.length > 0)) {
        // Add stage data if available
        if (parsedResponse.metadata?.stages && options.onStageComplete) {
          const stages = parsedResponse.metadata.stages;
          if (stages.metadata) options.onStageComplete('metadata', stages.metadata);
          if (stages.rules) options.onStageComplete('rules', stages.rules);
          if (stages.optimization) options.onStageComplete('optimization', stages.optimization);
          if (stages.report) options.onStageComplete('report', stages.report);
        }
        return parsedResponse;
      }
    }
    
    // Find the final result (old structure)
    const finalEvent = events.find(e => e.type === 'agent' && e.data?.output);
    if (finalEvent && finalEvent.data.output) {
      return parseADKResponse(finalEvent.data.output, events);
    }
    
    // Fallback: return last event with data
    const lastDataEvent = [...events].reverse().find(e => e.data);
    if (lastDataEvent) {
      return parseADKResponse(lastDataEvent.data, events);
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
function parseADKResponse(output, events = []) {
  // Try to extract structured data from the streaming events
  const structuredData = extractStructuredData(events);
  if (structuredData) {
    return structuredData;
  }
  
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
      // Try to extract JSON from the text
      const extractedData = extractJSONFromText(output);
      if (extractedData) {
        return extractedData;
      }
      
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
 * Extract structured data from streaming events
 */
function extractStructuredData(events) {
  let metadata = null;
  let rules = null;
  let optimization = null;
  let finalReport = null;
  let originalQuery = '';
  
  // Look for structured outputs in events
  for (const event of events) {
    let textContent = null;
    
    // Extract text content from different event structures
    if (event.content?.parts?.[0]?.text) {
      // New ADK structure
      textContent = event.content.parts[0].text;
      
      // Extract original query from initial message
      if (!originalQuery && event.content.role === 'user') {
        try {
          const parsed = JSON.parse(textContent);
          originalQuery = parsed.query || '';
        } catch {
          // Not JSON, might be plain query
        }
      }
    } else if (event.type === 'agent' && event.data?.output) {
      // Old structure
      textContent = event.data.output;
    }
    
    if (textContent && typeof textContent === 'string') {
      // Look for JSON blocks - try multiple patterns
      let jsonStrings = [];
      
      // Pattern 1: JSON in code blocks
      const codeBlockMatches = textContent.matchAll(/```json\n([\s\S]*?)\n```/g);
      for (const match of codeBlockMatches) {
        jsonStrings.push(match[1]);
      }
      
      // Pattern 2: Text between separators
      const separatorMatches = textContent.matchAll(/={60}\n.*?\n={60}\n([\s\S]*?)\n={60}/g);
      for (const match of separatorMatches) {
        jsonStrings.push(match[1].trim());
      }
      
      // Pattern 3: Raw JSON objects
      if (jsonStrings.length === 0) {
        const jsonMatches = textContent.matchAll(/\{[\s\S]*?\}/g);
        for (const match of jsonMatches) {
          jsonStrings.push(match[0]);
        }
      }
      
      // Try to parse each JSON string
      for (const jsonStr of jsonStrings) {
        if (jsonStr && jsonStr.trim()) {
          try {
            const data = JSON.parse(jsonStr);
            
            // Identify the type of data based on content
            if (data.tables_found !== undefined || data.tables !== undefined || 
                data.total_size_gb !== undefined || data.total_row_count !== undefined) {
              metadata = data;
              console.log('Found metadata in extractStructuredData:', data);
            } else if (data.rules_checked !== undefined || data.violations !== undefined) {
              rules = data;
              console.log('Found rules in extractStructuredData:', data);
            } else if (data.total_optimizations !== undefined || data.steps !== undefined || data.original_query !== undefined) {
              optimization = data;
              console.log('Found optimization in extractStructuredData:', data);
            } else if (data.executive_summary !== undefined || data.optimization_summary !== undefined) {
              finalReport = data;
              console.log('Found final report in extractStructuredData:', data);
            }
          } catch (e) {
            // Not valid JSON, skip
          }
        }
      }
    }
  }
  
  // If we have all the data, construct the final response
  if (optimization || finalReport) {
    const issues = [];
    const suggestions = [];
    
    // Extract issues from rules
    if (rules?.violations) {
      for (const violation of rules.violations) {
        issues.push({
          type: violation.rule_id,
          severity: violation.severity,
          description: violation.fix,
          impact: violation.impact
        });
      }
    }
    
    // Extract suggestions from final report
    if (finalReport?.recommendations) {
      suggestions.push(...finalReport.recommendations);
    }
    if (finalReport?.best_practices) {
      suggestions.push(...finalReport.best_practices);
    }
    
    // Build validation result if we have the data
    let validationResult = null;
    if (finalReport?.optimization_summary) {
      const summary = finalReport.optimization_summary;
      const execSummary = finalReport.executive_summary;
      
      // Parse cost values
      const originalCost = parseFloat(summary.estimated_cost_before?.replace('$', '') || '0');
      const optimizedCost = parseFloat(summary.estimated_cost_after?.replace('$', '') || '0');
      const costSavings = originalCost > 0 ? Math.round(((originalCost - optimizedCost) / originalCost) * 100) : 0;
      
      validationResult = {
        costSavings: costSavings,
        originalCost: originalCost.toFixed(2),
        optimizedCost: optimizedCost.toFixed(2),
        bytesProcessedOriginal: metadata?.total_size_gb ? metadata.total_size_gb * 1e9 : 1e12,
        bytesProcessedOptimized: metadata?.total_size_gb ? metadata.total_size_gb * 0.01 * 1e9 : 1e10,
        estimatedRowsOriginal: metadata?.tables?.[0]?.row_count || 1000000000,
        estimatedRowsOptimized: Math.round((metadata?.tables?.[0]?.row_count || 1000000000) * 0.01)
      };
    }
    
    return {
      originalQuery: optimization?.original_query || originalQuery || '',
      optimizedQuery: optimization?.final_query || finalReport?.optimization_summary?.final_query || '',
      issues: issues,
      suggestions: suggestions,
      validationResult: validationResult,
      metadata: {
        optimizationTime: 2.5,
        rulesApplied: rules?.rules_checked || 0,
        optimizationScore: rules?.compliance_score || 0,
        tablesAnalyzed: metadata?.tables_found || 0,
        totalDataSize: metadata?.total_size_gb || 0,
        stages: {
          metadata: metadata,
          rules: rules,
          optimization: optimization,
          report: finalReport
        }
      }
    };
  }
  
  // Even if we don't have optimization, return what we have
  if (metadata || rules) {
    console.log('Partial data available:', { metadata, rules });
    const issues = [];
    
    // Extract issues from rules
    if (rules?.violations) {
      for (const violation of rules.violations) {
        issues.push({
          type: violation.rule_id,
          severity: violation.severity,
          description: violation.fix,
          impact: violation.impact
        });
      }
    }
    
    return {
      originalQuery: originalQuery || '',
      optimizedQuery: '',  // No optimized query yet
      issues: issues,
      suggestions: ['Optimization in progress...'],
      validationResult: null,
      metadata: {
        optimizationTime: 0,
        rulesApplied: rules?.rules_checked || 0,
        optimizationScore: rules?.compliance_score || 0,
        tablesAnalyzed: metadata?.tables_found || 0,
        totalDataSize: metadata?.total_size_gb || 0,
        stages: {
          metadata: metadata,
          rules: rules,
          optimization: null,
          report: null
        }
      }
    };
  }
  
  return null;
}

/**
 * Extract JSON from text that contains JSON blocks
 */
function extractJSONFromText(text) {
  // Look for JSON content between separators
  const separatorPattern = /={60}\n.*?\n={60}\n([\s\S]*?)\n={60}/g;
  let match;
  const jsonBlocks = [];
  
  while ((match = separatorPattern.exec(text)) !== null) {
    const content = match[1];
    if (content.includes('{')) {
      try {
        // Try to parse as JSON
        const data = JSON.parse(content);
        jsonBlocks.push(data);
      } catch {
        // Try to extract JSON from the content
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]);
            jsonBlocks.push(data);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }
  
  // If we found JSON blocks, use them to build the response
  if (jsonBlocks.length > 0) {
    return extractStructuredData(jsonBlocks.map(data => ({
      type: 'agent',
      data: { output: JSON.stringify(data) }
    })));
  }
  
  return null;
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