// FigToCSS Exporter — Figma plugin main thread.
// Exports the current selection as REST-shaped JSON plus image fills,
// PNG renders (for Compare) and SVGs for vector-like nodes.
// The Plugin API has no rate limits, unlike the REST API.

var SVG_TYPES = {
  VECTOR: true,
  LINE: true,
  BOOLEAN_OPERATION: true,
  STAR: true,
  REGULAR_POLYGON: true,
};

figma.showUI(__html__, { width: 360, height: 420 });

function postSelection() {
  var selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'selection',
    count: selection.length,
    names: selection.slice(0, 5).map(function (n) { return n.name; }),
  });
}

function postProgress(label, done, total) {
  figma.ui.postMessage({ type: 'progress', label: label, done: done, total: total });
}

function errorMessage(err) {
  if (err && err.message) return err.message;
  return String(err);
}

function detectMime(bytes) {
  if (!bytes || bytes.length < 12) return 'application/octet-stream';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return 'application/octet-stream';
}

// Walk an exported REST node tree and collect image refs + vector node ids.
function collectRefs(node, imageRefs, svgIds) {
  if (!node || node.visible === false) return;
  var fills = node.fills || [];
  for (var i = 0; i < fills.length; i++) {
    var fill = fills[i];
    if (fill && fill.type === 'IMAGE' && fill.visible !== false && fill.imageRef) {
      imageRefs[fill.imageRef] = true;
    }
  }
  if (SVG_TYPES[node.type]) {
    svgIds.push(node.id);
    return; // the SVG covers the whole subtree
  }
  var children = node.children || [];
  for (var c = 0; c < children.length; c++) {
    collectRefs(children[c], imageRefs, svgIds);
  }
}

async function runExport() {
  var selection = figma.currentPage.selection.slice();
  if (selection.length === 0) {
    throw new Error('Select at least one layer on the current page first.');
  }

  var warnings = [];
  var exportedNodes = [];
  var renders = {};
  var images = {};
  var svgs = {};
  var imageRefs = {};
  var svgIds = [];
  var i;

  // 1. REST-shaped JSON for each selected node.
  for (i = 0; i < selection.length; i++) {
    var node = selection[i];
    postProgress('Exporting layer data', i, selection.length);
    try {
      var json = await node.exportAsync({ format: 'JSON_REST_V1' });
      if (json && json.document) {
        exportedNodes.push(json.document);
        collectRefs(json.document, imageRefs, svgIds);
      } else {
        warnings.push('No data returned for "' + node.name + '".');
      }
    } catch (err) {
      warnings.push('Could not export "' + node.name + '": ' + errorMessage(err));
    }
  }

  // 2. PNG renders of each selected root (used by the Compare view).
  for (i = 0; i < selection.length; i++) {
    var root = selection[i];
    postProgress('Rendering previews', i, selection.length);
    try {
      var png = await root.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 1 },
        useAbsoluteBounds: true, // match the layout box the CSS preview uses
      });
      renders[root.id] = figma.base64Encode(png);
    } catch (err) {
      warnings.push('Could not render "' + root.name + '": ' + errorMessage(err));
    }
  }

  // 3. Image fill bytes.
  var refs = Object.keys(imageRefs);
  for (i = 0; i < refs.length; i++) {
    var ref = refs[i];
    postProgress('Reading images', i, refs.length);
    try {
      var image = figma.getImageByHash(ref);
      if (!image) {
        warnings.push('Image ' + ref.slice(0, 8) + ' was not found in this file.');
        continue;
      }
      var bytes = await image.getBytesAsync();
      var entry = { mime: detectMime(bytes), data: figma.base64Encode(bytes) };
      try {
        var size = await image.getSizeAsync();
        entry.width = size.width;
        entry.height = size.height;
      } catch (sizeErr) {
        // Size is optional; only used for tiled fills.
      }
      images[ref] = entry;
    } catch (err) {
      warnings.push('Could not read image ' + ref.slice(0, 8) + ': ' + errorMessage(err));
    }
  }

  // 4. SVG strings for vector-like nodes.
  for (i = 0; i < svgIds.length; i++) {
    var id = svgIds[i];
    postProgress('Exporting vectors', i, svgIds.length);
    try {
      var vectorNode = await figma.getNodeByIdAsync(id);
      if (!vectorNode || typeof vectorNode.exportAsync !== 'function') {
        warnings.push('Vector ' + id + ' could not be found.');
        continue;
      }
      svgs[id] = await vectorNode.exportAsync({ format: 'SVG_STRING' });
    } catch (err) {
      warnings.push('Could not export vector ' + id + ': ' + errorMessage(err));
    }
  }

  if (exportedNodes.length === 0) {
    throw new Error('Nothing could be exported. ' + warnings.join(' '));
  }

  var page = figma.currentPage;
  return {
    format: 'figtocss',
    version: 1,
    exportedAt: new Date().toISOString(),
    fileName: figma.root.name,
    // figma.fileKey is only available to private plugins, so it is not exported.
    fileKey: null,
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        { id: page.id, name: page.name, type: 'CANVAS', children: exportedNodes },
      ],
    },
    images: images,
    renders: renders,
    svgs: svgs,
    warnings: warnings,
  };
}

figma.on('selectionchange', postSelection);
postSelection();

figma.ui.onmessage = async function (msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'export') {
    try {
      var result = await runExport();
      figma.ui.postMessage({ type: 'done', result: result });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: errorMessage(err) });
    }
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};
