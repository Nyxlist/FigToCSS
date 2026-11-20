/**
 * Node index — builds an id → node map (and id → parent map) once per
 * loaded document so lookups don't walk the whole tree every time.
 */

const indexCache = new WeakMap();

function buildIndex(document) {
  const byId = new Map();
  const parentOf = new Map();
  const stack = [document];
  while (stack.length > 0) {
    const node = stack.pop();
    byId.set(node.id, node);
    if (node.children) {
      for (const child of node.children) {
        parentOf.set(child.id, node);
        stack.push(child);
      }
    }
  }
  return {
    byId,
    parentOf,
    get: (id) => byId.get(id) || null,
    parent: (id) => parentOf.get(id) || null,
  };
}

/** Returns the (cached) index for a REST-shaped document node. */
export function getNodeIndex(document) {
  if (!document) return buildIndex({ id: '__empty__' });
  let index = indexCache.get(document);
  if (!index) {
    index = buildIndex(document);
    indexCache.set(document, index);
  }
  return index;
}

/** Resolves selection entries ({ id }) to nodes, dropping missing ones. */
export function resolveSelection(document, selectedNodes) {
  const index = getNodeIndex(document);
  return selectedNodes.map((sel) => index.get(sel.id)).filter(Boolean);
}

/** Depth-first walk over visible nodes. Return false from visit to skip children. */
export function walkVisible(node, visit, path = '') {
  if (!node || node.visible === false) return;
  const currentPath = path ? `${path} / ${node.name}` : node.name;
  if (visit(node, currentPath) === false) return;
  if (node.children) {
    for (const child of node.children) walkVisible(child, visit, currentPath);
  }
}
