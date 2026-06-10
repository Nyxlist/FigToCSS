/**
 * Figma API client — fast and reliable.
 *
 * - Batched image fetching (10 per batch, 200ms between batches)
 * - sessionStorage caching for image URLs
 * - localStorage caching for file data (5-min TTL)
 * - Exponential backoff + Retry-After on 429
 * - 15s timeout per request
 * - Progressive callback for image loading
 */

const FIGMA_API = 'https://api.figma.com/v1';
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1500;
const FILE_CACHE_TTL = 5 * 60 * 1000; // 5 min
const IMAGE_BATCH_SIZE = 15;
const BATCH_DELAY_MS = 200;

// ─── HELPERS ───────────────────────────────────────────────────────────────

function isLocalDev() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function resetApiState() {}

// ─── FILE CACHE (localStorage, 5-min TTL) ──────────────────────────────────

function fileCacheGet(key) {
  try {
    const raw = localStorage.getItem(`ftc_${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > FILE_CACHE_TTL) {
      localStorage.removeItem(`ftc_${key}`);
      return null;
    }
    return entry.data;
  } catch { return null; }
}

function fileCacheSet(key, data) {
  try {
    localStorage.setItem(`ftc_${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

// ─── IMAGE CACHE (sessionStorage, survives within tab session) ─────────────

function imageCacheGet(nodeId) {
  try {
    return sessionStorage.getItem(`ftc_img_${nodeId}`) || null;
  } catch { return null; }
}

function imageCacheSet(nodeId, url) {
  try {
    if (url) sessionStorage.setItem(`ftc_img_${nodeId}`, url);
  } catch {}
}

function imageCacheGetAll(nodeIds) {
  const cached = {};
  const uncached = [];
  for (const id of nodeIds) {
    const url = imageCacheGet(id);
    if (url) {
      cached[id] = url;
    } else {
      uncached.push(id);
    }
  }
  return { cached, uncached };
}

// ─── FETCH WITH RETRY ──────────────────────────────────────────────────────

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
              ? `Rate limited. Please wait ${waitSec} seconds and try again.`
              : `Too many requests. Please wait a moment and try again.`
          );
        }
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.err || `Request failed (${res.status})`);
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = new Error('Request timed out. Figma may be slow — try again.');
      } else {
        lastError = err;
      }
      if (lastError.message.includes('(4') && !lastError.message.includes('429')) throw lastError;
      if (attempt < MAX_RETRIES) await sleep(INITIAL_BACKOFF * Math.pow(2, attempt));
    }
  }

  throw lastError || new Error('Request failed after retries.');
}

// ─── PUBLIC: FETCH FILE ────────────────────────────────────────────────────

export async function fetchFigmaFile(fileKey, token) {
  const cached = fileCacheGet(`file_${fileKey}`);
  if (cached) return cached;

  const url = isLocalDev()
    ? `/api/figma/file/${fileKey}`
    : `${FIGMA_API}/files/${fileKey}`;

  const res = await fetchWithRetry(url, { headers: { 'X-Figma-Token': token } });
  const data = await res.json();
  fileCacheSet(`file_${fileKey}`, data);
  return data;
}

// ─── PUBLIC: FETCH IMAGES (BATCHED, FAST) ──────────────────────────────────

/**
 * Fetch rendered images for an array of node IDs.
 * Uses batches of 15 with 200ms between batches.
 * Checks sessionStorage cache first — only fetches uncached nodes.
 *
 * @param {string} fileKey
 * @param {string} token
 * @param {string[]} nodeIds
 * @param {object} options - { format, scale, onProgress }
 *   onProgress(loaded, total) called after each batch
 * @returns {{ images: Record<string, string|null> }}
 */
export async function fetchFigmaImages(fileKey, token, nodeIds, options = {}) {
  const { format = 'png', scale = '1', onProgress } = typeof options === 'string'
    ? { format: options, scale: arguments[4] || '1' }  // backwards compat: (fileKey, token, ids, format, scale)
    : options;

  const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];

  // Check cache first
  const { cached, uncached } = imageCacheGetAll(ids);
  const allImages = { ...cached };

  if (uncached.length === 0) {
    if (onProgress) onProgress(ids.length, ids.length);
    return { images: allImages };
  }

  // Fetch uncached in batches
  let loaded = Object.keys(cached).length;
  const total = ids.length;

  for (let i = 0; i < uncached.length; i += IMAGE_BATCH_SIZE) {
    const batch = uncached.slice(i, i + IMAGE_BATCH_SIZE);
    const idsStr = batch.join(',');

    const url = isLocalDev()
      ? `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(idsStr)}&format=${format}&scale=${scale}`
      : `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(idsStr)}&format=${format}&scale=${scale}`;

    try {
      const res = await fetchWithRetry(url, { headers: { 'X-Figma-Token': token } });
      const data = await res.json();

      if (data.images) {
        for (const [nodeId, imgUrl] of Object.entries(data.images)) {
          allImages[nodeId] = imgUrl;
          if (imgUrl) imageCacheSet(nodeId, imgUrl);
        }
      }
    } catch (err) {
      console.warn(`Batch image fetch failed:`, err.message);
      // Fill failed batch with null
      for (const nodeId of batch) {
        if (!allImages[nodeId]) allImages[nodeId] = null;
      }
    }

    loaded += batch.length;
    if (onProgress) onProgress(loaded, total);

    // Delay between batches (skip after last batch)
    if (i + IMAGE_BATCH_SIZE < uncached.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { images: allImages };
}

/**
 * Fetch a single node image (for comparison preview).
 * Uses scale=1 for speed, checks cache.
 */
export async function fetchNodeImage(fileKey, token, nodeId, format = 'png', scale = '1') {
  const cached = imageCacheGet(nodeId);
  if (cached) return cached;

  const url = isLocalDev()
    ? `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`
    : `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`;

  try {
    const res = await fetchWithRetry(url, { headers: { 'X-Figma-Token': token } });
    const data = await res.json();
    const imgUrl = data.images?.[nodeId] || null;
    if (imgUrl) imageCacheSet(nodeId, imgUrl);
    return imgUrl;
  } catch {
    return null;
  }
}
