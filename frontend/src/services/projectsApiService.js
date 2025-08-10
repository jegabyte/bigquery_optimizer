/**
 * Projects API Service
 * Connects to the FastAPI backend for BigQuery data operations
 */

// API base URL - update this when deployed
const API_BASE_URL = import.meta.env.VITE_BQ_API_URL || 'http://localhost:8001';

class ProjectsApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Fetch all projects
   */
  async getProjects() {
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
   * Get templates for a project
   */
  async getProjectTemplates(projectId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${projectId}/templates`, {
        method: 'GET',
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
      console.error('Error fetching templates:', error);
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
}

// Export singleton instance
export const projectsApiService = new ProjectsApiService();
export default projectsApiService;