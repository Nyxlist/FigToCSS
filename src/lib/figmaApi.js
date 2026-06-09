/**
 * Figma API client.
 * 
 * In development: calls the local proxy at /api/figma/...
 * In production (GitHub Pages): calls Figma API directly from the browser.
 * 
 * The user's personal access token is stored in-memory only (never persisted).
 */

const FIGMA_API = 'https://api.figma.com/v1';

function isLocalDev() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export async function fetchFigmaFile(fileKey, token) {
  if (isLocalDev()) {
    const res = await fetch(`/api/figma/file/${fileKey}`, {
      headers: { 'X-Figma-Token': token },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  // Direct call to Figma API (CORS allowed with token)
  const res = await fetch(`${FIGMA_API}/files/${fileKey}`, {
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
    const res = await fetch(
      `/api/figma/file/${fileKey}/images?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
      { headers: { 'X-Figma-Token': token } }
    );
    if (!res.ok) return { images: {} };
    return res.json();
  }

  const res = await fetch(
    `${FIGMA_API}/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
    { headers: { 'X-Figma-Token': token } }
  );
  if (!res.ok) return { images: {} };
  return res.json();
}
