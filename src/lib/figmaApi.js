/**
 * Figma API client.
 * 
 * In development: calls the local proxy at /api/figma/...
 * In production (GitHub Pages): calls Figma API directly from the browser.
 * 
 * The user's personal access token is stored in-memory only (never persisted).
 * 
 * Includes automatic retry with exponential backoff for rate-limited (429) responses.
 */

const FIGMA_API = 'https://api.figma.com/v1';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 10000; // start with 10s delay on rate limit

function isLocalDev() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple request queue to avoid firing multiple requests at once
let requestQueue = Promise.resolve();
const MIN_GAP_MS = 1500; // minimum 1.5s between requests

function enqueue(fn) {
  requestQueue = requestQueue.then(() => delay(MIN_GAP_MS)).then(fn);
  return requestQueue;
}

/**
 * Wrapper around fetch that retries on 429 (rate limit) with exponential backoff.
 * Requests are queued to avoid bursting the rate limit.
 */
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  return enqueue(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, options);

      if (res.status === 429) {
        if (attempt >= retries) {
          throw new Error('Rate limit exceeded. Please wait a minute and try again.');
        }
        // Use Retry-After header if available, otherwise exponential backoff
        const retryAfter = res.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt); // 10s, 20s, 40s, 80s, 160s
        console.warn(`Rate limited (429). Retrying in ${Math.round(waitMs / 1000)}s... (attempt ${attempt + 1}/${retries})`);
        await delay(waitMs);
        continue;
      }

      return res;
    }
  });
}

export async function fetchFigmaFile(fileKey, token) {
  if (isLocalDev()) {
    const res = await fetchWithRetry(`/api/figma/file/${fileKey}`, {
      headers: { 'X-Figma-Token': token },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  // Direct call to Figma API (CORS allowed with token)
  const res = await fetchWithRetry(`${FIGMA_API}/files/${fileKey}`, {
    headers: { 'X-Figma-Token': token },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.err || `Figma API returned ${res.status}`);
  }
  return res.json();
}

export async function fetchFigmaImages(fileKey, token, nodeIds, format = 'png', scale = '2') {
  const ids = Array.isArray(nodeIds) ? nodeIds.join(',') : nodeIds;

  if (isLocalDev()) {
    const res = await fetchWithRetry(
      `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
      { headers: { 'X-Figma-Token': token } }
    );
    if (!res.ok) return { images: {} };
    return res.json();
  }

  const res = await fetchWithRetry(
    `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
    { headers: { 'X-Figma-Token': token } }
  );
  if (!res.ok) return { images: {} };
  return res.json();
}
