/**
 * Builds the downloadable .zip: index.html, styles.css, images/, README.txt.
 */

import { zipSync, strToU8 } from 'fflate';
import { generateCSS, generateHTML } from './generator';
import {
  base64ToBytes, collectSvgNodes, detectMime, exportAssetNames, makeAssetResolvers,
} from './assets';
import { googleFontsUrl } from './fonts';
import { escapeHTML } from './generator/naming';

const STORE = { level: 0 }; // images are already compressed

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Bytes for every included image fill: { [imageRef]: { bytes, mime } } plus failures. */
async function loadImageBytes(source, imageAssets, fillUrls) {
  const loaded = {};
  const failed = {};
  for (const asset of imageAssets.filter((a) => a.included)) {
    const ref = asset.imageRef;
    try {
      if (source.kind === 'plugin') {
        const img = source.images?.[ref];
        if (!img?.data) throw new Error('missing from export');
        const bytes = base64ToBytes(img.data);
        loaded[ref] = { bytes, mime: img.mime || detectMime(bytes) };
      } else {
        const url = fillUrls?.[ref];
        if (!url) throw new Error('no URL from Figma');
        const bytes = await fetchBytes(url);
        loaded[ref] = { bytes, mime: detectMime(bytes) };
      }
    } catch (err) {
      failed[ref] = { asset, reason: err.message, url: fillUrls?.[ref] || null };
    }
  }
  return { loaded, failed };
}

export function buildIndexHTML({ title, fontsUrl, bodyHTML }) {
  const fontLinks = fontsUrl
    ? `  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${fontsUrl}" rel="stylesheet" />
`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHTML(title)}</title>
${fontLinks}  <link rel="stylesheet" href="styles.css" />
</head>
<body>
${bodyHTML}</body>
</html>
`;
}

/**
 * @returns {Promise<{ blob: Blob, warnings: string[] }>}
 */
export async function buildZip({ fileData, selectedNodes, settings, source, imageAssets, fontAssets, fillUrls }) {
  const { loaded, failed } = await loadImageBytes(source, imageAssets, fillUrls);
  const mimes = Object.fromEntries(Object.entries(loaded).map(([ref, v]) => [ref, v.mime]));
  const svgNodes = collectSvgNodes(fileData.document, selectedNodes, source);
  const names = exportAssetNames(fileData.document, selectedNodes, source, imageAssets, mimes);

  // Failed downloads keep their remote URL in the CSS.
  const remoteOverrides = {};
  const unavailable = new Set();
  const warnings = [];
  Object.entries(failed).forEach(([ref, info]) => {
    if (info.url) remoteOverrides[ref] = info.url;
    else unavailable.add(ref);
    warnings.push(`Image "${info.asset.name}" (${ref.slice(0, 8)}) could not be downloaded (${info.reason}).${info.url ? ' The CSS points to the remote Figma URL, which expires after a few days.' : ' It is missing from the CSS.'}`);
  });

  const resolvers = makeAssetResolvers({
    source, imageAssets, fillUrls, mode: 'export', names, remoteOverrides, unavailable,
  });
  const css = generateCSS(fileData, selectedNodes, settings, {
    ...resolvers,
    fileName: source.fileName,
    headerNote: 'Images live in the images/ folder next to this file.',
    reset: true,
  });
  const bodyHTML = generateHTML(fileData, selectedNodes, settings, resolvers);
  const html = buildIndexHTML({ title: source.fileName, fontsUrl: googleFontsUrl(fontAssets), bodyHTML });

  const files = {
    'index.html': strToU8(html),
    'styles.css': strToU8(css),
  };
  Object.entries(loaded).forEach(([ref, { bytes }]) => {
    if (names.images[ref]) files[`images/${names.images[ref]}`] = [bytes, STORE];
  });
  svgNodes.forEach((node) => {
    files[`images/${names.svgs[node.id]}`] = strToU8(node.svg);
  });
  if (warnings.length > 0) {
    files['README.txt'] = strToU8(`FigToCSS export warnings\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n`);
  }

  const zipped = zipSync(files, { level: 6 });
  return { blob: new Blob([zipped], { type: 'application/zip' }), warnings };
}
