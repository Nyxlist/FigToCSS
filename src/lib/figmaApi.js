/**
 * Figma REST API client tuned for very low monthly quotas.
 *
 * - Calls https://api.figma.com/v1 directly (Figma supports CORS).
 * - Never retries 4xx. 5xx / network / timeouts retry at most twice.
 * - 429: waits once if Retry-After <= 10s, otherwise fails with a clear message.
 * - File JSON is cached in IndexedDB and revalidated with the cheap
 *   /files/:key/meta endpoint (Tier 3) instead of a new Tier 1 call.
 */

import { cacheGet, cacheSet, cacheDeletePrefix } from './cache';

const FIGMA_API = 'https://api.figma.com/v1';
const REQUEST_TIMEOUT = 30000;
const TIER1 = { retries: 0, timeout: 120000, monthly: true };
const MAX_RETRIES = 2;
const BACKOFF_MS = 1500;
const SHORT_RETRY_LIMIT_S = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const inflight = new Map();

export class ApiError extends Error {
  constructor(message, { status = 0, retryAfter = null, planTier = null, rateLimitType = null, upgradeLink = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.planTier = planTier;
    this.rateLimitType = rateLimitType;
    this.upgradeLink = upgradeLink;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function humanDuration(seconds) {
  const s = Math.max(1, Math.round(seconds));
  const plural = (n, unit) => `about ${n} ${unit}${n === 1 ? '' : 's'}`;
  if (s < 90) return plural(s, 'second');
  if (s < 90 * 60) return plural(Math.round(s / 60), 'minute');
  if (s < 36 * 3600) return plural(Math.round(s / 3600), 'hour');
  return plural(Math.round(s / 86400), 'day');
}

function rateLimitError(info) {
  const parts = ['Figma API rate limit reached.'];
  if (info.retryAfter != null) {
    parts.push(`It resets in ${humanDuration(info.retryAfter)}.`);
  } else {
    parts.push('Try again later.');
  }
  if (info.rateLimitType === 'low') {
    parts.push('Your seat has the low (View/Collab) limit, which allows only a handful of file reads per month.');
  } else if (info.rateLimitType === 'high') {
    parts.push('This is the Dev/Full seat limit.');
  }
  parts.push('Use the "Plugin export" method instead — the Figma plugin has no rate limits.');
  return new ApiError(parts.join(' '), { status: 429, ...info });
}

async function errorFromResponse(res) {
  if (res.status === 429) {
    const header = (name) => res.headers.get(name);
    const retryRaw = header('Retry-After');
    const retryAfter = retryRaw != null && retryRaw !== '' && !Number.isNaN(Number(retryRaw)) ? Number(retryRaw) : null;
    return rateLimitError({
      retryAfter,
      planTier: header('X-Figma-Plan-Tier'),
      rateLimitType: header('X-Figma-Rate-Limit-Type'),
      upgradeLink: header('X-Figma-Upgrade-Link'),
    });
  }
  if (res.status === 401 || res.status === 403) {
    return new ApiError('Figma rejected the request: the token is invalid or expired, or it has no access to this file.', { status: res.status });
  }
  if (res.status === 404) {
    return new ApiError('File not found. Check the file URL or key.', { status: 404 });
  }
  const body = await res.json().catch(() => ({}));
  const detail = body.err || body.error || body.message;
  return new ApiError(`Figma request failed (${res.status})${typeof detail === 'string' ? `: ${detail}` : ''}.`, { status: res.status });
}

const MONTHLY_NOTE = ' This may have used one of your monthly API calls.';

/**
 * GET a Figma API path and return parsed JSON.
 * @param opts.retries retries for 5xx / network / timeouts (0 for Tier 1 calls)
 * @param opts.timeout ms before aborting
 * @param opts.monthly true for Tier 1 calls: failures mention the monthly quota
 */
async function request(path, token, { retries = MAX_RETRIES, timeout = REQUEST_TIMEOUT, monthly = false } = {}) {
  let waitedFor429 = false;
  let attempt = 0;
  const note = monthly ? MONTHLY_NOTE : '';

  for (;;) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
      res = await fetch(`${FIGMA_API}${path}`, {
        headers: { 'X-Figma-Token': token },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < retries) {
        attempt++;
        await sleep(BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      throw new ApiError(
        err.name === 'AbortError'
          ? `The request to Figma timed out.${note}`
          : `Network error while contacting Figma. Check your connection.${note}`
      );
    }
    clearTimeout(timeoutId);

    if (res.ok) return res.json();

    const error = await errorFromResponse(res);
    if (res.status === 429 && !waitedFor429 && error.retryAfter != null && error.retryAfter <= SHORT_RETRY_LIMIT_S) {
      waitedFor429 = true;
      await sleep(error.retryAfter * 1000);
      continue;
    }
    if (res.status >= 500) {
      if (attempt < retries) {
        attempt++;
        await sleep(BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      error.message += note;
    }
    throw error;
  }
}

/** Share one in-flight promise per key (React StrictMode double effects, double clicks). */
function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// ─── URL PARSING ───────────────────────────────────────────────────────────

/**
 * Extracts the file key from a Figma URL. Supports /file/, /design/,
 * /proto/, /board/ and branch URLs (/design/:key/branch/:branchKey/).
 */
export function extractFileKey(url) {
  const branch = url.match(/figma\.com\/(?:file|design)\/[a-zA-Z0-9]+\/branch\/([a-zA-Z0-9]+)/);
  if (branch) return branch[1];
  const match = url.match(/figma\.com\/(?:file|design|proto|board)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// ─── FILE ──────────────────────────────────────────────────────────────────

/** Errors where a cached copy is still the best answer (quota, outage, offline). */
function isTransient(err) {
  return err.status === 429 || err.status === 0 || err.status >= 500;
}

/**
 * Loads a file, reusing the IndexedDB copy when /meta says it hasn't changed.
 * Force reload also clears the cached image fills and renders for this file.
 * @returns {Promise<{ data: object, version: string, fromCache: boolean, notice: string|null }>}
 */
export function loadFigmaFile(fileKey, token, { force = false } = {}) {
  return dedupe(`file:${fileKey}:${force}`, async () => {
    const cacheKey = `file:${fileKey}`;
    if (force) {
      await cacheDeletePrefix(`fills:${fileKey}:`);
      await cacheDeletePrefix(`render:${fileKey}:`);
    }
    const cached = force ? null : await cacheGet(cacheKey);

    if (cached) {
      const fromCache = { data: cached.value.data, version: String(cached.value.version ?? ''), fromCache: true };
      try {
        const meta = await request(`/files/${fileKey}/meta`, token);
        const file = meta.file || meta;
        const sameVersion = file.version != null && String(file.version) === String(cached.value.version);
        const touched = file.last_touched_at ? Date.parse(file.last_touched_at) : NaN;
        const cachedModified = Date.parse(cached.value.lastModified);
        const notTouched = file.version == null && !Number.isNaN(touched) && touched <= cachedModified;
        if (sameVersion || notTouched) return { ...fromCache, notice: null };
      } catch (err) {
        if (!isTransient(err)) throw err;
        return {
          ...fromCache,
          notice: `Could not check for updates (${err.message}) Using the cached copy, which may be outdated.`,
        };
      }
    }

    const data = await request(`/files/${fileKey}`, token, TIER1);
    await cacheSet(cacheKey, { data, version: data.version, lastModified: data.lastModified });
    return { data, version: String(data.version ?? ''), fromCache: false, notice: null };
  });
}

// ─── IMAGE FILLS (Tier 2, one call per file version) ───────────────────────

/**
 * Returns { [imageRef]: url } for every image fill in the file.
 * Cached per file version; if a needed imageRef is missing from the cached
 * map, it is fetched again once.
 */
export function fetchImageFills(fileKey, token, version, requiredRefs = []) {
  return dedupe(`fills:${fileKey}:${version}`, async () => {
    const cacheKey = `fills:${fileKey}:${version}`;
    const cached = await cacheGet(cacheKey, WEEK_MS);
    if (cached && requiredRefs.every((ref) => ref in cached.value)) return cached.value;
    const res = await request(`/files/${fileKey}/images`, token);
    const map = res.meta?.images || {};
    await cacheSet(cacheKey, map);
    return map;
  });
}

// ─── NODE RENDERS (Tier 1, only on explicit user action) ───────────────────

const renderKey = (fileKey, version, nodeId) => `render:${fileKey}:${version}:${nodeId}`;

/** Returns a cached render URL without touching the network, or null. */
export async function getCachedRender(fileKey, version, nodeId) {
  const cached = await cacheGet(renderKey(fileKey, version, nodeId), WEEK_MS);
  return cached ? cached.value : null;
}

/** Fetches a PNG render of one node (scale 1, layout bounds). Uses one Tier 1 call. */
export function fetchNodeRender(fileKey, token, version, nodeId) {
  return dedupe(renderKey(fileKey, version, nodeId), async () => {
    const cached = await getCachedRender(fileKey, version, nodeId);
    if (cached) return cached;
    const query = `ids=${encodeURIComponent(nodeId)}&format=png&scale=1&use_absolute_bounds=true`;
    const res = await request(`/images/${fileKey}?${query}`, token, TIER1);
    const url = res.images?.[nodeId];
    if (!url) throw new ApiError('Figma could not render this layer.');
    await cacheSet(renderKey(fileKey, version, nodeId), url);
    return url;
  });
}
