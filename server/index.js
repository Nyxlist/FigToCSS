import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Helper: fetch with retry on 429 rate limit
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 3000;

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      if (attempt >= retries) return response;
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`Rate limited (429). Retrying in ${Math.round(waitMs / 1000)}s... (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return response;
  }
}

// Proxy endpoint to fetch Figma file data
app.get('/api/figma/file/:fileKey', async (req, res) => {
  const { fileKey } = req.params;
  const token = req.headers['x-figma-token'];

  if (!token) {
    return res.status(401).json({ error: 'Missing Figma access token' });
  }

  try {
    const response = await fetchWithRetry(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: { 'X-Figma-Token': token },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.err || `Figma API returned ${response.status}`,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Figma API error:', err);
    res.status(500).json({ error: 'Failed to fetch Figma file' });
  }
});

// Proxy endpoint to fetch specific nodes
app.get('/api/figma/file/:fileKey/nodes', async (req, res) => {
  const { fileKey } = req.params;
  const { ids } = req.query;
  const token = req.headers['x-figma-token'];

  if (!token) {
    return res.status(401).json({ error: 'Missing Figma access token' });
  }

  try {
    const response = await fetchWithRetry(
      `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`,
      { headers: { 'X-Figma-Token': token } }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.err || `Figma API returned ${response.status}`,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Figma API error:', err);
    res.status(500).json({ error: 'Failed to fetch Figma nodes' });
  }
});

// Proxy endpoint to get image renders for thumbnails
app.get('/api/figma/file/:fileKey/images', async (req, res) => {
  const { fileKey } = req.params;
  const { ids, format = 'png', scale = '0.5' } = req.query;
  const token = req.headers['x-figma-token'];

  if (!token) {
    return res.status(401).json({ error: 'Missing Figma access token' });
  }

  try {
    const response = await fetchWithRetry(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
      { headers: { 'X-Figma-Token': token } }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.err || `Figma API returned ${response.status}`,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Figma images API error:', err);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
