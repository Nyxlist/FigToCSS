/**
 * Express proxy server for Figma API.
 *
 * Features:
 * - Rate-limit-aware request queue (50 requests/min, auto-throttle)
 * - Retry with exponential backoff + Retry-After header support
 * - Per-node staggered image fetching (prevents 429)
 * - Concurrency control (max 5 simultaneous)
 * - Clear error messages with rate limit info
 */

import express from 'express';
import cors from 'cors';
import requestQueue from './rateLimitHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

const FIGMA_API = 'https://api.figma.com/v1';
const REQUEST_TIMEOUT = 15000;
const IMAGE_STAGGER_MS = 150;

app.use(cors());
app.use(express.json());

// ─── SLEEP HELPER ──────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── SINGLE FIGMA REQUEST (with timeout, used inside the queue) ────────────

async function figmaRequest(url, token) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, {
      headers: { 'X-Figma-Token': token },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const err = new Error(
        retryAfter
          ? `Rate limit: wait ${retryAfter} seconds before retrying`
          : 'Rate limit exceeded. Please wait and try again.'
      );
      err.status = 429;
      err.retryAfter = retryAfter ? parseInt(retryAfter, 10) : 30;
      throw err;
    }

    if (res.status >= 500) {
      const err = new Error(`Figma server error (${res.status})`);
      err.status = res.status;
      throw err;
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const err = new Error(errorData.err || errorData.error || `Figma API returned ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out (15s). The Figma API may be slow — try again.');
      timeoutErr.status = 408;
      timeoutErr.code = 'TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  }
}

// ─── PROXY HELPERS ─────────────────────────────────────────────────────────

function getToken(req) {
  return req.headers['x-figma-token'];
}

function requireToken(req, res) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Figma access token. Add your Personal Access Token in the app.' });
    return null;
  }
  return token;
}

// ─── ROUTES ────────────────────────────────────────────────────────────────

// Health / status check
app.get('/api/status', (req, res) => {
  res.json({ ok: true, queue: requestQueue.getStatus() });
});

// Fetch full file data
app.get('/api/figma/file/:fileKey', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { fileKey } = req.params;
  const url = `${FIGMA_API}/files/${fileKey}`;

  try {
    const data = await requestQueue.enqueue(() => figmaRequest(url, token));
    res.json(data);
  } catch (err) {
    console.error('[File]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Fetch specific nodes
app.get('/api/figma/file/:fileKey/nodes', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { fileKey } = req.params;
  const { ids } = req.query;
  const url = `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(ids || '')}`;

  try {
    const data = await requestQueue.enqueue(() => figmaRequest(url, token));
    res.json(data);
  } catch (err) {
    console.error('[Nodes]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Fetch batch images
app.get('/api/figma/file/:fileKey/images', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { fileKey } = req.params;
  const { ids, format = 'png', scale = '2' } = req.query;
  const url = `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(ids || '')}&format=${format}&scale=${scale}`;

  try {
    const data = await requestQueue.enqueue(() => figmaRequest(url, token));
    res.json(data);
  } catch (err) {
    console.error('[Images]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * Fetch images ONE AT A TIME with stagger delay.
 * POST body: { ids: string[], format?, scale? }
 * Returns: { images: { [nodeId]: url | null }, errors?: [...] }
 *
 * This is the reliable endpoint — fetches sequentially to avoid rate limits.
 */
app.post('/api/figma/file/:fileKey/images-staggered', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { fileKey } = req.params;
  const { ids = [], format = 'png', scale = '2' } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }

  const images = {};
  const errors = [];

  for (let i = 0; i < ids.length; i++) {
    const nodeId = ids[i];

    // Stagger between requests
    if (i > 0) {
      await sleep(IMAGE_STAGGER_MS);
    }

    try {
      const url = `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`;
      const data = await requestQueue.enqueue(() => figmaRequest(url, token));
      if (data.images && data.images[nodeId]) {
        images[nodeId] = data.images[nodeId];
      } else {
        images[nodeId] = null;
      }
    } catch (err) {
      console.error(`[ImageStagger] Failed for ${nodeId}:`, err.message);
      images[nodeId] = null;
      errors.push({ nodeId, error: err.message });
    }
  }

  const response = { images };
  if (errors.length > 0) response.errors = errors;
  res.json(response);
});

// ─── START ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✓ Figma proxy running at http://localhost:${PORT}`);
  console.log(`  Rate limit: ${requestQueue.maxPerMinute} requests/min`);
});
