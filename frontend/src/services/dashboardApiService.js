/**
 * Dashboard API Service
 * Fetches real BigQuery statistics for the dashboard
 */

const API_BASE_URL = import.meta.env.VITE_BQ_API_URL || 'http://localhost:8001';

class DashboardApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Fetch dashboard statistics with timeout
   */
  async getDashboardStats() {
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for dashboard
      
      const response = await fetch(`${this.baseUrl}/api/dashboard/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request timeout while fetching dashboard stats');
      } else {
        console.error('Error fetching dashboard stats:', error);
      }
      // Return mock data as fallback
      return this.getMockStats();
    }
  }

  /**
   * Get mock statistics for fallback
   */
  getMockStats() {
    return {
      stats: {
        total_projects: 0,
        total_templates: 0,
        total_query_runs: 0,
        total_tb_processed: 0,
        avg_runtime_seconds: 0,
        total_cost_estimate: 0
      },
      recent_templates: [],
      top_cost_drivers: []
    };
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }
}

// Export singleton instance
export const dashboardApiService = new DashboardApiService();
export default dashboardApiService;