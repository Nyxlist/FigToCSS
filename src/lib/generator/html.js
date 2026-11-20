/**
 * HTML mirroring the Figma layer hierarchy. Shares class naming with the
 * CSS generator. Images are CSS backgrounds only (no <img> duplicates).
 */

import { nodeToClassName } from './naming';
import { textInnerHTML } from './text';

/**
 * @param node REST node
 * @param ctx { prefix, hasSvg(nodeId) }
 */
export function nodeToHTML(node, ctx, depth = 0) {
  if (!node || node.visible === false) return '';
  const className = nodeToClassName(node, ctx.prefix);
  const indent = '  '.repeat(depth);

  if (node.type === 'TEXT') {
    return `${indent}<p class="${className}">${textInnerHTML(node, className)}</p>\n`;
  }

  const children = (node.children || []).filter((c) => c.visible !== false);
  if (ctx.hasSvg(node.id) || children.length === 0) {
    return `${indent}<div class="${className}"></div>\n`;
  }

  let html = `${indent}<div class="${className}">\n`;
  children.forEach((child) => {
    html += nodeToHTML(child, ctx, depth + 1);
  });
  html += `${indent}</div>\n`;
  return html;
}
