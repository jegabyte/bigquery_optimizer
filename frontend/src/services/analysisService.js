/**
 * Service for managing analysis results persistence
 * Stores and retrieves analysis results from localStorage
 * In production, this should be stored in Firestore
 */

const STORAGE_KEY = 'bq_template_analysis_results';

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
      
      const response = await fetch(`http://localhost:8001/api/analyses?${params}`, {
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
   * Get analysis from Firestore by ID
   * This is a placeholder that returns null for now
   */
  getAnalysisFromFirestore: async (analysisId) => {
    try {
      // In production, this should call the Firestore API
      // For now, try to find it in localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      
      const data = JSON.parse(stored);
      
      // Search through all projects and templates for the analysis
      for (const projectId in data) {
        for (const templateId in data[projectId]) {
          const analysis = data[projectId][templateId];
          if (`${projectId}_${templateId}` === analysisId) {
            return {
              id: analysisId,
              query: analysis.result?.query || '',
              timestamp: analysis.timestamp,
              result: analysis.result,
              project_id: projectId,
              template_id: templateId
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get analysis from Firestore:', error);
      return null;
    }
  },

  /**
   * Save analysis to Firestore
   * This is a placeholder that saves to localStorage for now
   */
  saveAnalysisToFirestore: async (analysisData) => {
    try {
      // In production, this should call the Firestore API to save the analysis
      // For now, save to localStorage as a backup
      const { project_id, template_id, result } = analysisData;
      
      if (project_id && template_id) {
        // Use the existing saveAnalysisResult method
        return analysisService.saveAnalysisResult(project_id, template_id, result);
      }
      
      // If no project_id/template_id, create a standalone analysis entry
      const stored = localStorage.getItem('standalone_analyses') || '{}';
      const data = JSON.parse(stored);
      const analysisId = `analysis_${Date.now()}`;
      
      data[analysisId] = {
        ...analysisData,
        id: analysisId,
        timestamp: new Date().toISOString()
      };
      
      localStorage.setItem('standalone_analyses', JSON.stringify(data));
      return { success: true, id: analysisId };
    } catch (error) {
      console.error('Failed to save analysis to Firestore:', error);
      return { success: false, error: error.message };
    }
  }
};

export default analysisService;
export const getRecentAnalyses = analysisService.getRecentAnalyses;
export const isFirestoreAvailable = analysisService.isFirestoreAvailable;
export const getAnalysisFromFirestore = analysisService.getAnalysisFromFirestore;
export const saveAnalysisToFirestore = analysisService.saveAnalysisToFirestore;