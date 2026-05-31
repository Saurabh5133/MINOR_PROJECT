const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const mlHealth = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 5000 });
    res.json({ status: 'ok', ml_service: mlHealth.data });
  } catch (err) {
    res.json({
      status: 'degraded',
      ml_service: { status: 'unreachable', error: err.message }
    });
  }
});

// ─── Optimize Query ───────────────────────────────────────────────────────────
app.post('/api/optimize', async (req, res) => {
  const { query, schema, use_llm = false, calculate_cloud_cost = true } = req.body;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/optimize`,
      { query, schema: schema || {}, use_llm, calculate_cloud_cost },
      { timeout: 60000 }
    );
    res.json(response.data);
  } catch (err) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(503).json({
        error: 'ML service unavailable',
        detail: err.message,
        hint: 'Make sure the Python ML service is running on port 5001'
      });
    }
  }
});

// ─── Cloud Cost Only ──────────────────────────────────────────────────────────
app.post('/api/cloud-cost', async (req, res) => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/cloud-cost`, req.body, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json({ error: 'ML service unavailable', detail: err.message });
  }
});

// ─── LLM Status ───────────────────────────────────────────────────────────────
app.get('/api/llm-status', async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/llm-status`, { timeout: 5000 });
    res.json(response.data);
  } catch (err) {
    res.json({ enabled: false, message: 'ML service unavailable' });
  }
});

// ─── Feature Extraction ───────────────────────────────────────────────────────
app.post('/api/features', async (req, res) => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/features`, req.body, { timeout: 10000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json({ error: 'ML service unavailable' });
  }
});


// ─── Index Recommendations ────────────────────────────────────────────────────
app.post('/api/index-advice', async (req, res) => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/index-advice`, req.body, { timeout: 30000 });
    res.json(response.data);
  } catch (err) {
    if (err.response) res.status(err.response.status).json(err.response.data);
    else res.status(503).json({ error: 'ML service unavailable', detail: err.message });
  }
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Backend] Server running on http://localhost:${PORT}`);
  console.log(`[Backend] ML service: ${ML_SERVICE_URL}`);
});
