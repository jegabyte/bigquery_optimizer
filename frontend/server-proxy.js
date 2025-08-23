import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// Get environment variables
const AGENT_API_URL = process.env.AGENT_API_URL || 'https://bigquery-optimizer-agent-api-978412153928.us-central1.run.app';
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'https://bigquery-optimizer-backend-api-978412153928.us-central1.run.app';

console.log('Server Proxy Configuration:');
console.log('  AGENT_API_URL:', AGENT_API_URL);
console.log('  BACKEND_API_URL:', BACKEND_API_URL);
console.log('  Running on App Engine:', process.env.GAE_APPLICATION ? 'Yes' : 'No');

// Function to get ID token from metadata service (App Engine)
async function getIdToken(targetAudience) {
  try {
    // On App Engine, use the metadata service to get an ID token
    if (process.env.GAE_APPLICATION) {
      const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${targetAudience}`;
      const response = await axios.get(metadataUrl, {
        headers: {
          'Metadata-Flavor': 'Google'
        }
      });
      return response.data;
    }
    
    // For local development, try to use gcloud auth
    console.log('Local development - using application default credentials');
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(targetAudience);
    const headers = await client.getRequestHeaders();
    return headers.Authorization?.replace('Bearer ', '');
  } catch (error) {
    console.error('Failed to get ID token:', error.message);
    return null;
  }
}

// Proxy requests to Agent API
app.all('/api/agent/*', async (req, res) => {
  const targetPath = req.path.replace('/api/agent', '');
  const targetUrl = AGENT_API_URL + targetPath;
  
  console.log(`Proxying to Agent API: ${req.method} ${targetUrl}`);
  
  try {
    // Get ID token for the Agent API
    const idToken = await getIdToken(AGENT_API_URL);
    
    if (!idToken) {
      console.error('Failed to get ID token for Agent API');
      return res.status(500).json({ error: 'Authentication failed' });
    }
    
    // Make the request with authentication
    const response = await axios({
      url: targetUrl,
      method: req.method,
      data: req.body,
      params: req.query,
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Accept': req.headers['accept'] || 'application/json'
      },
      validateStatus: () => true // Don't throw on any status
    });
    
    // Forward the response
    res.status(response.status);
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.set(key, value);
      }
    });
    res.send(response.data);
  } catch (error) {
    console.error('Agent API proxy error:', error.message);
    res.status(500).json({ 
      error: 'Failed to proxy request to Agent API',
      details: error.message 
    });
  }
});

// Proxy requests to Backend API
app.all('/api/backend/*', async (req, res) => {
  const targetPath = req.path.replace('/api/backend', '');
  const targetUrl = BACKEND_API_URL + targetPath;
  
  console.log(`Proxying to Backend API: ${req.method} ${targetUrl}`);
  
  try {
    // Get ID token for the Backend API
    const idToken = await getIdToken(BACKEND_API_URL);
    
    if (!idToken) {
      console.error('Failed to get ID token for Backend API');
      return res.status(500).json({ error: 'Authentication failed' });
    }
    
    console.log('Got ID token for Backend API, length:', idToken ? idToken.length : 0);
    
    // Make the request with authentication
    const response = await axios({
      url: targetUrl,
      method: req.method,
      data: req.body,
      params: req.query,
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Accept': req.headers['accept'] || 'application/json'
      },
      validateStatus: () => true // Don't throw on any status
    });
    
    // Log response details
    console.log('Backend API response status:', response.status);
    if (response.status >= 400) {
      console.log('Backend API error response:', response.data);
    }
    
    // Forward the response
    res.status(response.status);
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.set(key, value);
      }
    });
    res.send(response.data);
  } catch (error) {
    console.error('Backend API proxy error:', error.message);
    console.error('Full error:', error.response?.data || error.stack);
    res.status(500).json({ 
      error: 'Failed to proxy request to Backend API',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    isAppEngine: !!process.env.GAE_APPLICATION
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server proxy running on port ${PORT}`);
  console.log(`Environment: ${process.env.GAE_APPLICATION ? 'App Engine' : 'Local'}`);
  console.log(`Proxying Agent API: ${AGENT_API_URL}`);
  console.log(`Proxying Backend API: ${BACKEND_API_URL}`);
});