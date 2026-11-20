/**
 * Deterministic class naming shared by the CSS and HTML generators,
 * so selectors and markup always match.
 *
 * Class = <prefix><name>__<id>. Names never contain "__" (underscore runs are
 * collapsed and trimmed) and ids never do either, so the last "__" is an
 * unambiguous separator and different ids can never produce the same class.
 */

/** Makes a string safe to use as (part of) a CSS class or file name. */
export function sanitize(str) {
  const s = String(str ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '');
  return s || 'layer';
}

/**
 * Figma node id → identifier-safe suffix that keeps separators:
 * "1:23" → "1-23", "I1:2;3:4" → "I1-2_3-4".
 */
export function idSuffix(id) {
  return String(id).replace(/[^a-zA-Z0-9]/g, (ch) => {
    if (ch === ':') return '-';
    if (ch === ';') return '_';
    return `-u${ch.charCodeAt(0).toString(16)}-`;
  });
}

/** Class names may not start with a digit, or with "-" followed by a digit. */
function safeIdentifier(name) {
  return /^(-?\d|--)/.test(name) ? `_${name}` : name;
}

export function nodeToClassName(node, prefix = '') {
  const cleanPrefix = prefix ? String(prefix).replace(/[^a-zA-Z0-9_-]/g, '-') : '';
  return safeIdentifier(`${cleanPrefix}${sanitize(node.name)}__${idSuffix(node.id)}`);
}

export function getPrefix(settings) {
  return settings.namingMode === 'custom' ? settings.customPrefix || '' : '';
}

export function getClassName(node, settings) {
  return nodeToClassName(node, getPrefix(settings));
}

export function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Quotes a URL for use inside url('…'). */
export function cssUrl(url) {
  return `url('${String(url).replace(/\\/g, '%5C').replace(/'/g, '%27').replace(/[\n\r]/g, '')}')`;
}
