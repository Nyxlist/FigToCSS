/**
 * Express proxy server for Figma API.
 *
 * Features:
 * - Proxies requests to avoid CORS in development
 * - Concurrency control: max 5 concurrent requests to Figma
 * - Retry logic with exponential backoff
 * - Rate limit info forwarded to client
 * - Per-node image endpoint with staggered fetching
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

const FIGMA_API = 'https://api.figma.com/v1';
const MAX_CONCURRENT = 5;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;
const REQUEST_TIMEOUT = 15000;
const IMAGE_STAGGER_MS = 100;

app.use(cors());
app.use(express.json());

// ─── CONCURRENCY LIMITER (p-limit style) ──────────────────────────────────

let activeCount = 0;
const queue = [];

function runNext() {
  if (activeCount >= MAX_CONCURRENT || queue.length === 0) return;
  activeCount++;
  const { fn, resolve, reject } = queue.shift();
  fn().then(resolve, reject).finally(() => {
    activeCount--;
    runNext();
  });
}

function withLimit(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    runNext();
  });
}

// ─── SLEEP HELPER ──────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── FETCH WITH RETRY & BACKOFF ────────────────────────────────────────────

async function figmaFetch(url, token) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
        const waitMs = waitSeconds
          ? waitSeconds * 1000
          : INITIAL_BACKOFF * Math.pow(2, attempt);

        if (attempt >= MAX_RETRIES) {
          return {
            ok: false,
            status: 429,
            body: {
              error: waitSeconds
                ? `Rate limit: wait ${waitSeconds} seconds before retrying`
                : 'Rate limit: too many requests. Please wait and try again.',
            },
          };
        }

        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return {
          ok: false,
          status: res.status,
          body: {
            error: errorData.err || errorData.error || `Figma API returned ${res.status}`,
          },
        };
      }

      const data = await res.json();
      return { ok: true, status: 200, body: data };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        lastError = 'Request timed out after 15 seconds';
      } else {
        lastError = err.message || 'Network error';
      }

      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }

  return {
    ok: false,
    status: 500,
    body: { error: lastError || 'Request failed after retries' },
  };
}

// ─── PROXY HELPERS ─────────────────────────────────────────────────────────

function getToken(req) {
  return req.headers['x-figma-token'];
}

function requireToken(req, res) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Figma access token' });
    return null;
  }
  return token;
}

// ─── ROUTES ────────────────────────────────────────────────────────────────

// Fetch full file data
app.get('/api/figma/file/:fileKey', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { fileKey } = req.params;
  const url = `${FIGMA_API}/files/${fileKey}`;

  try {
    const result = await withLimit(() => figmaFetch(url, token));
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Proxy error (file):', err);
    res.status(500).json({ error: 'Internal proxy error' });
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
    const result = await withLimit(() => figmaFetch(url, token));
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Proxy error (nodes):', err);
    res.status(500).json({ error: 'Internal proxy error' });
  }
});

// Fetch batch images (existing behavior)
app.get('/api/figma/file/:fileKey/images', async (req, res) => {
  const token = requireToken(req, res);
  if (!token) return;

  const { fileKey } = req.params;
  const { ids, format = 'png', scale = '2' } = req.query;
  const url = `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(ids || '')}&format=${format}&scale=${scale}`;

  try {
    const result = await withLimit(() => figmaFetch(url, token));
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Proxy error (images):', err);
    res.status(500).json({ error: 'Internal proxy error' });
  }
});

/**
 * Fetch images ONE AT A TIME with stagger delay.
 * Accepts a JSON body with { ids: string[], format?, scale? }
 * Returns { images: { [nodeId]: url } }
 *
 * This prevents rate-limiting when fetching many node images.
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

    // Stagger: wait between requests (skip first)
    if (i > 0) {
      await sleep(IMAGE_STAGGER_MS);
    }

    const url = `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`;

    try {
      const result = await withLimit(() => figmaFetch(url, token));
      if (result.ok && result.body.images) {
        Object.assign(images, result.body.images);
      } else {
        errors.push({ nodeId, error: result.body?.error || 'Unknown error' });
      }
    } catch (err) {
      errors.push({ nodeId, error: err.message });
    }
  }

  const response = { images };
  if (errors.length > 0) {
    response.errors = errors;
  }
  res.json(response);
});

// ─── START ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Figma proxy server running on http://localhost:${PORT}`);
});
