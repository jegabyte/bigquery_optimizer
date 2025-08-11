/**
 * Projects API Service
 * Connects to the FastAPI backend for BigQuery data operations
 */

// API base URL - update this when deployed
const API_BASE_URL = import.meta.env.VITE_BQ_API_URL || 'http://localhost:8001';

class ProjectsApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds cache
  }
  
  /**
   * Get cached data or null if expired
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }
  
  /**
   * Set cache data
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Fetch all projects with caching
   */
  async getProjects() {
    const cacheKey = 'projects';
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error fetching projects:', error);
      // Return mock data as fallback
      const { mockProjects } = await import('./projectsMockData');
      return mockProjects;
    }
  }

  /**
   * Create a new project
   */
  async createProject(projectConfig) {
    try {
      const response = await fetch(`${this.baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectConfig.projectId,
          display_name: projectConfig.name,
          analysis_window: projectConfig.analysisWindow,
          regions: projectConfig.regions,
          datasets: projectConfig.datasets,
          pricing_mode: projectConfig.pricingMode,
          price_per_tb: projectConfig.pricePerTB,
          auto_detect_regions: projectConfig.autoDetectRegions,
          auto_detect_datasets: projectConfig.autoDetectDatasets,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create project');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating project:', error);
      // Try to extract error message from response
      if (error.response) {
        const errorData = await error.response.json();
        throw new Error(errorData.detail || 'Failed to create project');
      }
      throw error;
    }
  }

  /**
   * Scan a project for queries
   */
  async scanProject(projectId, analysisWindow = 30) {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/projects/scan?project_id=${projectId}&analysis_window=${analysisWindow}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error scanning project:', error);
      throw error;
    }
  }

  /**
   * Get templates for a project with caching (now fetches from Firestore with analysis results)
   */
  async getProjectTemplates(projectId) {
    const cacheKey = `templates_${projectId}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second (2 minute) timeout
      
      // Use the new Firestore endpoint that includes analysis results
      const response = await fetch(`${this.baseUrl}/api/templates/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Fallback to the old endpoint if new one not available
        const fallbackResponse = await fetch(`${this.baseUrl}/api/projects/${projectId}/templates`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!fallbackResponse.ok) {
          throw new Error(`HTTP error! status: ${fallbackResponse.status}`);
        }
        
        const data = await fallbackResponse.json();
        return data;
      }

      const data = await response.json();
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request timeout while fetching templates');
      } else {
        console.error('Error fetching templates:', error);
      }
      // Return mock data as fallback
      const { getProjectTemplates } = await import('./projectsMockData');
      return getProjectTemplates(projectId);
    }
  }

  /**
   * Refresh project data
   */
  async refreshProject(projectId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${projectId}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error refreshing project:', error);
      throw error;
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }

  /**
   * Get template runs
   */
  async getTemplateRuns(templateId) {
    // For now, return mock data
    // This endpoint can be implemented in the API later
    const { getTemplateRuns } = await import('./projectsMockData');
    return getTemplateRuns(templateId);
  }

  /**
   * Analyze templates
   */
  async analyzeTemplates(templateIds, analysisType = 'rules_rewrite_validate') {
    // This will connect to the existing ADK backend for analysis
    // For now, return a mock response
    return {
      success: true,
      message: `Analysis started for ${templateIds.length} templates`,
      jobId: `job_${Date.now()}`,
    };
  }

  /**
   * Save analysis result for a template to Firestore
   */
  async saveTemplateAnalysis(projectId, templateId, result) {
    try {
      const response = await fetch(`${this.baseUrl}/api/templates/save-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          template_id: templateId,
          result: result,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error saving analysis result:', error);
      throw error;
    }
  }

  /**
   * Get analysis result for a specific template
   */
  async getTemplateAnalysis(projectId, templateId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/templates/${projectId}/${templateId}/analysis`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null; // No analysis found
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching analysis result:', error);
      return null;
    }
  }
}

// Export singleton instance
export const projectsApiService = new ProjectsApiService();
export default projectsApiService;