/**
 * Figma API client with request queue, exponential backoff, and caching.
 *
 * In development: calls the local proxy at /api/figma/...
 * In production (GitHub Pages): calls Figma API directly from the browser.
 *
 * Features:
 * - Request queue with exponential backoff (max 3 retries)
 * - Respects Retry-After header on 429
 * - Per-node image fetching with 100ms stagger
 * - 15s timeout per request
 * - localStorage caching for file metadata (TTL 5 minutes)
 * - Clear error messages
 */

const FIGMA_API = 'https://api.figma.com/v1';
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const IMAGE_STAGGER_MS = 100;

// ─── HELPERS ───────────────────────────────────────────────────────────────

function isLocalDev() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** No-op reset kept for API compatibility with App.jsx */
export function resetApiState() {}

// ─── CACHE ─────────────────────────────────────────────────────────────────

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

// ─── REQUEST QUEUE WITH RETRY ──────────────────────────────────────────────

/**
 * Fetch with timeout, exponential backoff, and Retry-After support.
 */
async function fetchWithRetry(url, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        // Rate limited — respect Retry-After header
        const retryAfter = res.headers.get('Retry-After');
        const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
        const waitMs = waitSeconds
          ? waitSeconds * 1000
          : INITIAL_BACKOFF * Math.pow(2, attempt);

        if (attempt >= MAX_RETRIES) {
          throw new Error(
            waitSeconds
              ? `Rate limit: wait ${waitSeconds} seconds before retrying`
              : `Rate limit: too many requests. Please wait and try again.`
          );
        }

        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error || data.err || `Request failed (${res.status})`;
        throw new Error(message);
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        lastError = new Error('Request timed out after 15 seconds');
      } else {
        lastError = err;
      }

      // Don't retry on non-retriable errors (4xx except 429)
      if (lastError.message.includes('Request failed (4')) {
        throw lastError;
      }

      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────

/**
 * Fetch a Figma file's metadata and document tree.
 * Results are cached in localStorage for 5 minutes.
 */
export async function fetchFigmaFile(fileKey, token) {
  const cacheKey = `figma_file_${fileKey}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = isLocalDev()
    ? `/api/figma/file/${fileKey}`
    : `${FIGMA_API}/files/${fileKey}`;

  const res = await fetchWithRetry(url, {
    headers: { 'X-Figma-Token': token },
  });

  const data = await res.json();
  cacheSet(cacheKey, data);
  return data;
}

/**
 * Fetch rendered images for multiple node IDs (batch endpoint).
 */
export async function fetchFigmaImages(fileKey, token, nodeIds, format = 'png', scale = '2') {
  const ids = Array.isArray(nodeIds) ? nodeIds.join(',') : nodeIds;

  const url = isLocalDev()
    ? `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`
    : `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`;

  const res = await fetchWithRetry(url, {
    headers: { 'X-Figma-Token': token },
  });

  return res.json();
}

/**
 * Fetch a rendered image for a single node, with stagger support.
 * Used for sequential per-node fetching to avoid rate limits.
 * Each call waits 100ms before executing to stagger requests.
 */
export async function fetchNodeImage(fileKey, token, nodeId, format = 'png', scale = '2') {
  // Stagger: wait 100ms between per-node requests
  await sleep(IMAGE_STAGGER_MS);

  const url = isLocalDev()
    ? `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`
    : `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`;

  const res = await fetchWithRetry(url, {
    headers: { 'X-Figma-Token': token },
  });

  const data = await res.json();
  // Return just the URL for this single node
  const images = data.images || {};
  return images[nodeId] || null;
}
