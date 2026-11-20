/**
 * Asset helpers: decoding plugin exports, object URLs, deterministic file
 * names for exports, and URL resolvers handed to the generator.
 */

import { getNodeIndex, walkVisible } from './nodeIndex';
import { sanitize, idSuffix } from './generator/naming';

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function detectMime(bytes) {
  const b = bytes;
  if (!b || b.length < 12) return 'application/octet-stream';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}

export function extFromMime(mime) {
  return MIME_EXT[mime] || 'bin';
}

export function svgDataUrl(svg) {
  // encodeURIComponent leaves ' ( ) unescaped; ' would end a url('…') string.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
}

function bytesToObjectUrl(bytes, mime) {
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/**
 * Creates object URLs for plugin images and renders (call once per load).
 * If decoding fails partway, already-created URLs are revoked before rethrowing.
 */
export function createPluginUrls(exportData) {
  const imageUrls = {};
  const renderUrls = {};
  try {
    for (const [ref, img] of Object.entries(exportData.images || {})) {
      if (img?.data) imageUrls[ref] = bytesToObjectUrl(base64ToBytes(img.data), img.mime || 'application/octet-stream');
    }
    for (const [id, data] of Object.entries(exportData.renders || {})) {
      if (data) renderUrls[id] = bytesToObjectUrl(base64ToBytes(data), 'image/png');
    }
  } catch (err) {
    Object.values(imageUrls).forEach((url) => URL.revokeObjectURL(url));
    Object.values(renderUrls).forEach((url) => URL.revokeObjectURL(url));
    throw err;
  }
  return { imageUrls, renderUrls };
}

export function revokeSourceUrls(source) {
  if (!source || source.kind !== 'plugin') return;
  Object.values(source.imageUrls || {}).forEach((url) => URL.revokeObjectURL(url));
  Object.values(source.renderUrls || {}).forEach((url) => URL.revokeObjectURL(url));
}

function sourceSvgs(source) {
  return source?.kind === 'plugin' ? source.svgs || {} : {};
}

/**
 * Unique image fills (by imageRef) used in the selection, with the layers
 * that use them. Layers rendered as SVG are skipped (the SVG embeds them).
 */
export function collectImageAssets(document, selectedNodes, source) {
  const index = getNodeIndex(document);
  const svgs = sourceSvgs(source);
  const byRef = new Map();

  selectedNodes.forEach((sel) => {
    walkVisible(index.get(sel.id), (node, path) => {
      if (svgs[node.id]) return false;
      (node.fills || []).forEach((fill) => {
        if (fill.type !== 'IMAGE' || fill.visible === false || !fill.imageRef) return;
        if (!byRef.has(fill.imageRef)) {
          const info = source?.kind === 'plugin' ? source.images?.[fill.imageRef] : null;
          byRef.set(fill.imageRef, {
            imageRef: fill.imageRef,
            name: node.name,
            layers: [],
            width: info?.width || node.absoluteBoundingBox?.width || 0,
            height: info?.height || node.absoluteBoundingBox?.height || 0,
            included: true,
          });
        }
        const asset = byRef.get(fill.imageRef);
        if (!asset.layers.some((l) => l.id === node.id)) {
          asset.layers.push({ id: node.id, name: node.name, path });
        }
      });
      return undefined;
    });
  });

  return [...byRef.values()];
}

/** Nodes in the selection that are rendered from an exported SVG. */
export function collectSvgNodes(document, selectedNodes, source) {
  const index = getNodeIndex(document);
  const svgs = sourceSvgs(source);
  const result = [];
  const seen = new Set();
  selectedNodes.forEach((sel) => {
    walkVisible(index.get(sel.id), (node) => {
      if (!svgs[node.id]) return undefined;
      if (!seen.has(node.id)) {
        seen.add(node.id);
        result.push({ id: node.id, name: node.name, svg: svgs[node.id] });
      }
      return false;
    });
  });
  return result;
}

/** Plugin images know their MIME; API images are assumed PNG until fetched. */
export function imageExtension(source, imageRef, mimeOverrides = {}) {
  const mime = mimeOverrides[imageRef] || (source?.kind === 'plugin' ? source.images?.[imageRef]?.mime : null);
  return mime ? extFromMime(mime) : 'png';
}

/**
 * Deterministic, deduped export file names:
 * sanitized layer name + short imageRef / node id suffix.
 */
export function buildAssetNames(imageAssets, svgNodes, extFor) {
  const used = new Set();
  const unique = (base, ext) => {
    let name = `${base}.${ext}`;
    let n = 2;
    while (used.has(name)) name = `${base}-${n++}.${ext}`;
    used.add(name);
    return name;
  };
  const images = {};
  imageAssets.forEach((asset) => {
    const base = `${sanitize(asset.name).slice(0, 40)}_${asset.imageRef.slice(0, 8)}`;
    images[asset.imageRef] = unique(base, extFor(asset.imageRef));
  });
  const svgs = {};
  svgNodes.forEach((node) => {
    const base = `${sanitize(node.name).slice(0, 40)}_${idSuffix(node.id)}`;
    svgs[node.id] = unique(base, 'svg');
  });
  return { images, svgs };
}

/**
 * Export file names shared by Download CSS / Copy, the zip and single-image
 * downloads. Built from ALL detected images (included or not) so names don't
 * change when toggling. mimeOverrides: imageRef → detected MIME (API images).
 */
export function exportAssetNames(document, selectedNodes, source, imageAssets, mimeOverrides = {}) {
  const svgNodes = collectSvgNodes(document, selectedNodes, source);
  return buildAssetNames(imageAssets, svgNodes, (ref) => imageExtension(source, ref, mimeOverrides));
}

/**
 * Builds { getImage, getSvgUrl } for the generator.
 * mode 'preview' → object / remote / data URLs; 'export' → images/<file>.
 * remoteOverrides: imageRef → remote URL to keep (failed zip downloads).
 * unavailable: Set of imageRefs to drop (failed downloads without a URL).
 */
export function makeAssetResolvers({
  source, imageAssets, fillUrls, mode, names, remoteOverrides = {}, unavailable = null,
}) {
  const assetsByRef = new Map(imageAssets.map((a) => [a.imageRef, a]));
  const svgs = sourceSvgs(source);
  const svgUrlCache = new Map();

  const getImage = (imageRef) => {
    const asset = assetsByRef.get(imageRef);
    if (!asset || !asset.included || unavailable?.has(imageRef)) return null;
    const info = source?.kind === 'plugin' ? source.images?.[imageRef] : null;
    let url = null;
    if (mode === 'export' && !remoteOverrides[imageRef]) {
      url = names?.images[imageRef] ? `images/${names.images[imageRef]}` : null;
    } else if (remoteOverrides[imageRef]) {
      url = remoteOverrides[imageRef];
    } else if (source?.kind === 'plugin') {
      url = source.imageUrls?.[imageRef] || null;
    } else {
      url = fillUrls?.[imageRef] || null;
    }
    return url ? { url, width: info?.width || null, height: info?.height || null } : null;
  };

  const getSvgUrl = (nodeId) => {
    if (!svgs[nodeId]) return null;
    if (mode === 'export') return names?.svgs[nodeId] ? `images/${names.svgs[nodeId]}` : null;
    if (!svgUrlCache.has(nodeId)) svgUrlCache.set(nodeId, svgDataUrl(svgs[nodeId]));
    return svgUrlCache.get(nodeId);
  };

  return { getImage, getSvgUrl };
}
