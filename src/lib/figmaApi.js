/**
 * Figma API client with:
 * - Exponential backoff + Retry-After support
 * - 15s timeout per request
 * - localStorage caching (5-minute TTL)
 * - Per-node sequential image fetching with stagger
 * - Clear error messages for users
 *
 * In dev: proxies through localhost:3001/api/figma/...
 * In prod: calls Figma API directly (CORS allowed with token header)
 */

const FIGMA_API = 'https://api.figma.com/v1';
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1500;
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const IMAGE_STAGGER_MS = 150;

// ─── HELPERS ───────────────────────────────────────────────────────────────

function isLocalDev() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** No-op for API compatibility */
export function resetApiState() {}

// ─── CACHE ─────────────────────────────────────────────────────────────────

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(`ftc_${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) {
      localStorage.removeItem(`ftc_${key}`);
      return null;
    }
    return entry.data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(`ftc_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* full or unavailable */ }
}

// ─── FETCH WITH RETRY + BACKOFF ────────────────────────────────────────────

async function fetchWithRetry(url, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : null;
        const waitMs = waitSec ? waitSec * 1000 : INITIAL_BACKOFF * Math.pow(2, attempt);

        if (attempt >= MAX_RETRIES) {
          throw new Error(
            waitSec
              ? `Rate limited by Figma. Please wait ${waitSec} seconds and try again.`
              : `Too many requests. Please wait a moment and try again.`
          );
        }
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || data.err || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        lastError = new Error('Request timed out. The Figma API may be slow — please try again.');
      } else {
        lastError = err;
      }

      // Don't retry 4xx (except 429 handled above)
      if (lastError.message.includes('(4') && !lastError.message.includes('429')) {
        throw lastError;
      }

      if (attempt < MAX_RETRIES) {
        await sleep(INITIAL_BACKOFF * Math.pow(2, attempt));
      }
    }
  }

  throw lastError || new Error('Request failed after multiple retries.');
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────

/**
 * Fetch Figma file metadata and document tree.
 * Cached in localStorage for 5 minutes.
 */
export async function fetchFigmaFile(fileKey, token) {
  // Check cache first
  const cached = cacheGet(`file_${fileKey}`);
  if (cached) return cached;

  const url = isLocalDev()
    ? `/api/figma/file/${fileKey}`
    : `${FIGMA_API}/files/${fileKey}`;

  const res = await fetchWithRetry(url, {
    headers: { 'X-Figma-Token': token },
  });

  const data = await res.json();
  cacheSet(`file_${fileKey}`, data);
  return data;
}

/**
 * Fetch rendered images for node IDs.
 * Uses batch endpoint for small sets, staggered for larger sets.
 */
export async function fetchFigmaImages(fileKey, token, nodeIds, format = 'png', scale = '2') {
  const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];

  // For small batches (≤5), use the batch endpoint
  if (ids.length <= 5) {
    const idsStr = ids.join(',');
    const url = isLocalDev()
      ? `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(idsStr)}&format=${format}&scale=${scale}`
      : `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(idsStr)}&format=${format}&scale=${scale}`;

    const res = await fetchWithRetry(url, {
      headers: { 'X-Figma-Token': token },
    });
    return res.json();
  }

  // For larger batches, use staggered endpoint (local) or sequential (prod)
  if (isLocalDev()) {
    const res = await fetchWithRetry(`/api/figma/file/${fileKey}/images-staggered`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Figma-Token': token,
      },
      body: JSON.stringify({ ids, format, scale }),
    });
    return res.json();
  }

  // Production: fetch one at a time with stagger
  const images = {};
  for (let i = 0; i < ids.length; i++) {
    if (i > 0) await sleep(IMAGE_STAGGER_MS);
    try {
      const url = `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(ids[i])}&format=${format}&scale=${scale}`;
      const res = await fetchWithRetry(url, { headers: { 'X-Figma-Token': token } });
      const data = await res.json();
      if (data.images) Object.assign(images, data.images);
    } catch (err) {
      console.warn(`Image fetch failed for ${ids[i]}:`, err.message);
      images[ids[i]] = null;
    }
  }
  return { images };
}

/**
 * Fetch a single node's rendered image.
 */
export async function fetchNodeImage(fileKey, token, nodeId, format = 'png', scale = '2') {
  const url = isLocalDev()
    ? `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`
    : `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`;

  try {
    const res = await fetchWithRetry(url, { headers: { 'X-Figma-Token': token } });
    const data = await res.json();
    return data.images?.[nodeId] || null;
  } catch {
    return null;
  }
}
