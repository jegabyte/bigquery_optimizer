const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const path = require('path');

const app = express();
const auth = new GoogleAuth();
const PORT = process.env.PORT || 8080;

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// Proxy API requests with authentication
app.use('/api/agent/*', async (req, res) => {
  try {
    const targetUrl = process.env.AGENT_API_URL + req.path.replace('/api/agent', '');
    const client = await auth.getIdTokenClient(process.env.AGENT_API_URL);
    const response = await client.request({
      url: targetUrl,
      method: req.method,
      data: req.body,
      headers: {
        ...req.headers,
        'host': undefined
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Agent API proxy error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.use('/api/backend/*', async (req, res) => {
  try {
    const targetUrl = process.env.BACKEND_API_URL + req.path.replace('/api/backend', '');
    const client = await auth.getIdTokenClient(process.env.BACKEND_API_URL);
    const response = await client.request({
      url: targetUrl,
      method: req.method,
      data: req.body,
      headers: {
        ...req.headers,
        'host': undefined
      }
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Backend API proxy error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server with authentication proxy running on port ${PORT}`);
});
