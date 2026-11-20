/**
 * Validates a FigToCSS plugin export and turns it into { fileData, source }.
 */

import { createPluginUrls } from './assets';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @param input string (JSON text) or already-parsed object */
export function parsePluginExport(input) {
  let data = input;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) throw new Error('The export is empty. Paste or drop the .figtocss.json file from the plugin.');
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('This is not valid JSON. Make sure you copied the whole export from the plugin.');
    }
  }

  if (!isObject(data) || data.format !== 'figtocss') {
    throw new Error('This file is not a FigToCSS plugin export. Use "Export selection" in the FigToCSS Exporter plugin.');
  }
  if (data.version !== 1) {
    throw new Error(`Unsupported export version (${data.version}). Update the web app or re-export with a matching plugin.`);
  }
  const pages = data.document?.children;
  if (!Array.isArray(pages) || pages.length === 0 || !pages.some((p) => Array.isArray(p.children) && p.children.length > 0)) {
    throw new Error('The export contains no layers. Select something in Figma before exporting.');
  }

  const images = isObject(data.images) ? data.images : {};
  const renders = isObject(data.renders) ? data.renders : {};
  const svgs = isObject(data.svgs) ? data.svgs : {};

  let urls;
  try {
    urls = createPluginUrls({ images, renders });
  } catch {
    throw new Error('The export contains corrupted image data. Try exporting again.');
  }

  const fileName = data.fileName || 'Untitled';
  return {
    fileData: { name: fileName, document: data.document },
    source: {
      kind: 'plugin',
      fileName,
      exportedAt: data.exportedAt || null,
      images,
      renders,
      svgs,
      imageUrls: urls.imageUrls,
      renderUrls: urls.renderUrls,
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    },
  };
}
