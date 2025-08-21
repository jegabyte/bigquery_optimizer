/**
 * Service for managing analysis results persistence
 * Stores and retrieves analysis results from BigQuery via Backend API
 */

const STORAGE_KEY = 'bq_template_analysis_results';
const API_BASE_URL = import.meta.env.VITE_BACKEND_API_URL || import.meta.env.VITE_BQ_API_URL || 'http://localhost:8001';

export const analysisService = {
  /**
   * Save analysis result for a template
   */
  saveAnalysisResult: (projectId, templateId, result) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const data = stored ? JSON.parse(stored) : {};
      
      if (!data[projectId]) {
        data[projectId] = {};
      }
      
      data[projectId][templateId] = {
        result,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Failed to save analysis result:', error);
      return false;
    }
  },

  /**
   * Get analysis result for a template
   */
  getAnalysisResult: (projectId, templateId) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      
      const data = JSON.parse(stored);
      return data[projectId]?.[templateId]?.result || null;
    } catch (error) {
      console.error('Failed to get analysis result:', error);
      return null;
    }
  },

  /**
   * Get all analysis results for a project
   */
  getProjectAnalysisResults: (projectId) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return {};
      
      const data = JSON.parse(stored);
      const projectData = data[projectId] || {};
      
      // Extract just the results
      const results = {};
      Object.keys(projectData).forEach(templateId => {
        results[templateId] = projectData[templateId].result;
      });
      
      return results;
    } catch (error) {
      console.error('Failed to get project analysis results:', error);
      return {};
    }
  },

  /**
   * Clear analysis results for a template
   */
  clearAnalysisResult: (projectId, templateId) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return true;
      
      const data = JSON.parse(stored);
      if (data[projectId] && data[projectId][templateId]) {
        delete data[projectId][templateId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
      
      return true;
    } catch (error) {
      console.error('Failed to clear analysis result:', error);
      return false;
    }
  },

  /**
   * Clear all analysis results for a project
   */
  clearProjectAnalysisResults: (projectId) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return true;
      
      const data = JSON.parse(stored);
      if (data[projectId]) {
        delete data[projectId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
      
      return true;
    } catch (error) {
      console.error('Failed to clear project analysis results:', error);
      return false;
    }
  },

  /**
   * Get recent analyses from Firestore API
   */
  getRecentAnalyses: async (filters = {}, limit = 100) => {
    try {
      // Fetch from Firestore API
      const params = new URLSearchParams();
      if (filters.project_id) params.append('project_id', filters.project_id);
      if (filters.user_id) params.append('user_id', filters.user_id);
      params.append('limit', limit);
      
      const response = await fetch(`${API_BASE_URL}/api/analyses?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const analyses = await response.json();
      
      // Format analyses for the frontend
      return analyses.map(analysis => ({
        id: analysis.id || analysis.analysis_id,
        query: analysis.query,
        timestamp: analysis.timestamp,
        result: analysis.result,
        project_id: analysis.project_id,
        user_id: analysis.user_id,
        created_at: analysis.created_at || analysis.timestamp
      }));
    } catch (error) {
      console.error('Failed to get recent analyses from Firestore:', error);
      return [];
    }
  },

  /**
   * Check if Firestore is available
   * Returns true to use Firestore API
   */
  isFirestoreAvailable: async () => {
    // Use Firestore API instead of localStorage
    return true;
  },

  /**
   * Get analysis from Backend API by ID (fetches from BigQuery)
   */
  getAnalysisFromFirestore: async (analysisId) => {
    try {
      // Fetch from backend API which gets from BigQuery
      const response = await fetch(`${API_BASE_URL}/api/analyses/${analysisId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const analysis = await response.json();
      console.log('Raw analysis from backend:', analysis);
      
      // Return the raw analysis data as-is (it already has the correct structure)
      // The backend returns: { query, options, result, stage_data, timestamp, project_id, user_id }
      return {
        id: analysis.id || analysis.analysis_id || analysisId,
        query: analysis.query || '',
        options: analysis.options || {},
        result: analysis.result || {},
        stage_data: analysis.stage_data || {},
        timestamp: analysis.timestamp || analysis.created_at,
        project_id: analysis.project_id,
        user_id: analysis.user_id,
        // Keep backward compatibility fields
        created_at: analysis.created_at || analysis.timestamp
      };
    } catch (error) {
      console.error('Failed to get analysis from Backend API:', error);
      
      // Fallback to localStorage
      const stored = localStorage.getItem(`analysis-result-${analysisId}`);
      if (stored) {
        return JSON.parse(stored);
      }
      
      return null;
    }
  },

  /**
   * Save analysis to Backend API (which saves to BigQuery)
   */
  saveAnalysisToFirestore: async (analysisData) => {
    try {
      const { query, result, projectId, project_id } = analysisData;
      
      // Use projectId or project_id
      const finalProjectId = projectId || project_id || 'default';
      
      // Call the backend API to save to BigQuery
      const response = await fetch(`${API_BASE_URL}/api/analyses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify({
          query: query || result?.query || '',
          project_id: finalProjectId,
          result: result,
          analysis_type: 'optimization',
          created_by: 'user@example.com', // TODO: Get from auth
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const savedAnalysis = await response.json();
      console.log('Analysis saved to BigQuery:', savedAnalysis);
      
      // Also save to localStorage as backup
      const stored = localStorage.getItem('standalone_analyses') || '{}';
      const data = JSON.parse(stored);
      const analysisId = savedAnalysis.analysis_id || `analysis_${Date.now()}`;
      
      data[analysisId] = {
        ...analysisData,
        id: analysisId,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem('standalone_analyses', JSON.stringify(data));
      
      return { 
        success: true, 
        id: analysisId,
        analysis_id: savedAnalysis.analysis_id 
      };
    } catch (error) {
      console.error('Failed to save analysis to BigQuery:', error);
      
      // Fallback to localStorage if API fails
      const stored = localStorage.getItem('standalone_analyses') || '{}';
      const data = JSON.parse(stored);
      const analysisId = `analysis_${Date.now()}`;
      
      data[analysisId] = {
        ...analysisData,
        id: analysisId,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem('standalone_analyses', JSON.stringify(data));
      return { success: true, id: analysisId, error: error.message };
    }
  },

  /**
   * Get recent analyses from Backend API
   */
  getRecentAnalysesFromAPI: async (limit = 100, projectId = null) => {
    try {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (projectId) params.append('project_id', projectId);
      
      const response = await fetch(`${API_BASE_URL}/api/analyses?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const analyses = await response.json();
      return analyses;
    } catch (error) {
      console.error('Failed to get recent analyses from Backend API:', error);
      // Fallback to localStorage if API fails
      return analysisService.getAllAnalysisResults();
    }
  },

  /**
   * Create new analysis via Backend API
   */
  createAnalysis: async (query, projectId, templateId = null) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify({
          query: query,
          project_id: projectId,
          template_id: templateId,
          analysis_type: 'manual',
          created_by: 'user@example.com' // TODO: Get from auth
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to create analysis:', error);
      throw error;
    }
  }
};

export default analysisService;
export const getRecentAnalyses = analysisService.getRecentAnalyses;
export const isFirestoreAvailable = analysisService.isFirestoreAvailable;
export const getAnalysisFromFirestore = analysisService.getAnalysisFromFirestore;
export const saveAnalysisToFirestore = analysisService.saveAnalysisToFirestore;