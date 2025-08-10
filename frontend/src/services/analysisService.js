/**
 * Analysis Service for interacting with Firestore backend
 * Handles saving and retrieving analysis results
 */

const API_BASE_URL = import.meta.env.VITE_BQ_API_URL || 'http://localhost:8001';

/**
 * Save an analysis result to Firestore
 * @param {Object} analysisData - The analysis data to save
 * @returns {Promise<Object>} - The saved analysis with ID
 */
export async function saveAnalysisToFirestore(analysisData) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: analysisData.query,
        options: analysisData.options || {},
        result: analysisData.result,
        stage_data: analysisData.stageData || {},
        timestamp: analysisData.timestamp || new Date().toISOString(),
        project_id: analysisData.projectId || analysisData.options?.projectId || 'default',
        user_id: analysisData.userId || 'anonymous'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to save analysis: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Analysis saved to Firestore:', result);
    return result;
  } catch (error) {
    console.error('Error saving analysis to Firestore:', error);
    // Don't throw the error - let the caller decide how to handle it
    return null;
  }
}

/**
 * Get an analysis result from Firestore
 * @param {string} analysisId - The ID of the analysis to retrieve
 * @returns {Promise<Object|null>} - The analysis data or null if not found
 */
export async function getAnalysisFromFirestore(analysisId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyses/${analysisId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Analysis not found
      }
      throw new Error(`Failed to get analysis: ${response.statusText}`);
    }

    const analysis = await response.json();
    console.log('Analysis retrieved from Firestore:', analysis);
    return analysis;
  } catch (error) {
    console.error('Error getting analysis from Firestore:', error);
    return null;
  }
}

/**
 * Get recent analyses from Firestore
 * @param {Object} filters - Optional filters (projectId, userId)
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Array>} - Array of recent analyses
 */
export async function getRecentAnalyses(filters = {}, limit = 10) {
  try {
    const params = new URLSearchParams();
    if (filters.projectId) params.append('project_id', filters.projectId);
    if (filters.userId) params.append('user_id', filters.userId);
    params.append('limit', limit.toString());

    const response = await fetch(`${API_BASE_URL}/api/analyses?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get recent analyses: ${response.statusText}`);
    }

    const analyses = await response.json();
    console.log(`Retrieved ${analyses.length} recent analyses from Firestore`);
    return analyses;
  } catch (error) {
    console.error('Error getting recent analyses from Firestore:', error);
    return [];
  }
}

/**
 * Check if Firestore backend is available
 * @returns {Promise<boolean>} - True if backend is available, false otherwise
 */
export async function isFirestoreAvailable() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      return false;
    }

    const health = await response.json();
    return health.firestore_connected === true;
  } catch (error) {
    console.error('Error checking Firestore availability:', error);
    return false;
  }
}