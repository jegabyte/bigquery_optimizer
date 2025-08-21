/**
 * Centralized configuration for Frontend
 * All environment variables and configuration should be defined here
 */

const config = {
  // API URLs - these are set during build time via Vite env variables
  agentApiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  backendApiUrl: import.meta.env.VITE_BACKEND_API_URL || import.meta.env.VITE_BQ_API_URL || 'http://localhost:8001',
  
  // Google Cloud Configuration (passed from backend)
  gcpProjectId: import.meta.env.VITE_GCP_PROJECT_ID || 'aiva-e74f3',
  bqDataset: import.meta.env.VITE_BQ_DATASET || 'bq_optimizer',
  
  // Application Configuration
  appEnv: import.meta.env.VITE_APP_ENV || 'development',
  debug: import.meta.env.VITE_DEBUG === 'true',
  
  // Feature Flags
  enableMockData: import.meta.env.VITE_ENABLE_MOCK_DATA === 'true',
  enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  
  // UI Configuration
  itemsPerPage: 20,
  maxRetries: 3,
  requestTimeout: 30000, // 30 seconds
  
  // Helper methods
  getApiUrl: function(service = 'backend') {
    return service === 'agent' ? this.agentApiUrl : this.backendApiUrl;
  },
  
  isProduction: function() {
    return this.appEnv === 'production';
  },
  
  isDevelopment: function() {
    return this.appEnv === 'development';
  },
  
  // Log configuration on load (only in development)
  printConfig: function() {
    if (this.debug || this.isDevelopment()) {
      console.log('=== Frontend Configuration ===');
      console.log('Agent API URL:', this.agentApiUrl);
      console.log('Backend API URL:', this.backendApiUrl);
      console.log('GCP Project:', this.gcpProjectId);
      console.log('BQ Dataset:', this.bqDataset);
      console.log('Environment:', this.appEnv);
      console.log('==============================');
    }
  }
};

// Print config in development mode
if (config.isDevelopment()) {
  config.printConfig();
}

export default config;