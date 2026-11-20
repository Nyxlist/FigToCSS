/**
 * Figma node → CSS/HTML generator (public entry).
 *
 * generateCSS / generateHTML take the loaded file ({ document }), the
 * selection ([{ id }]), the user settings and options:
 *   - getImage(imageRef) → { url, width, height } | null
 *   - getSvgUrl(nodeId) → url | null (node is drawn from its SVG)
 *   - fileName, date: used in the header comment
 *   - headerNote: extra header comment line
 *   - reset: prepend a small CSS reset
 */

import { resolveSelection } from '../nodeIndex';
import { nodeToClassName, getPrefix, cssUrl } from './naming';
import { createVariableRegistry } from './variables';
import { applyLayout, applyShape, applyRotation } from './layout';
import { applyFills, applyStrokes, applyEffects } from './paint';
import { applyText, overrideStyles } from './text';
import { nodeToHTML } from './html';

export { nodeToClassName, getClassName } from './naming';

const BLEND_MODES = {
  MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay',
  DARKEN: 'darken', LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge', COLOR_BURN: 'color-burn',
  HARD_LIGHT: 'hard-light', SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference', EXCLUSION: 'exclusion',
  HUE: 'hue', SATURATION: 'saturation',
  COLOR: 'color', LUMINOSITY: 'luminosity',
};

export const CSS_RESET = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
p { margin: 0; }`;

function createContext(settings, options) {
  return {
    settings,
    prefix: getPrefix(settings),
    absoluteMode: settings.layoutMethod === 'absolute',
    vars: createVariableRegistry(Boolean(settings.includeVariables)),
    getImage: options.getImage || (() => null),
    getSvgUrl: options.getSvgUrl || (() => null),
  };
}

const round2 = (n) => Number(n.toFixed(2));
const near = (a, b) => Math.abs(a - b) < 0.5;

/**
 * Draws a node from its exported SVG. Figma exports the SVG at the node's
 * render bounds (strokes, shadows, zero-width lines), which can be larger
 * than the layout box. Backgrounds can't paint outside their box, so in that
 * case the SVG goes on a ::before pseudo-element placed at the render bounds.
 * @returns pseudo-element props, or null when the background fits the box.
 */
function applySvg(props, node, svgUrl) {
  const box = node.absoluteBoundingBox;
  const render = node.absoluteRenderBounds;
  const fits = !box || !render || (near(box.x, render.x) && near(box.y, render.y)
    && near(box.width, render.width) && near(box.height, render.height));
  if (fits) {
    props['background-image'] = cssUrl(svgUrl);
    props['background-size'] = '100% 100%';
    props['background-repeat'] = 'no-repeat';
    return null;
  }
  if (!props['position']) props['position'] = 'relative';
  props['overflow'] = 'visible';
  return {
    content: "''",
    position: 'absolute',
    left: `${round2(render.x - box.x)}px`,
    top: `${round2(render.y - box.y)}px`,
    width: `${round2(render.width)}px`,
    height: `${round2(render.height)}px`,
    'background-image': cssUrl(svgUrl),
    'background-size': '100% 100%',
    'background-repeat': 'no-repeat',
    'pointer-events': 'none',
  };
}

function nodeProps(node, ctx, layoutContext) {
  const props = {};
  const svgUrl = ctx.getSvgUrl(node.id);
  let pseudo = null;

  applyLayout(props, node, ctx, layoutContext);

  if (svgUrl) {
    // Drawn from the exported SVG: it already contains fills, strokes,
    // effects, rotation and opacity.
    pseudo = applySvg(props, node, svgUrl);
  } else if (node.type !== 'TEXT') {
    applyFills(props, node, ctx);
    applyStrokes(props, node, ctx);
  }

  applyShape(props, node, Boolean(svgUrl));

  if (!svgUrl) {
    applyRotation(props, node);
    applyEffects(props, node);
    if (node.opacity != null && node.opacity < 1) props['opacity'] = String(Number(node.opacity.toFixed(2)));
  }

  if (BLEND_MODES[node.blendMode]) props['mix-blend-mode'] = BLEND_MODES[node.blendMode];
  if (node.type === 'TEXT') applyText(props, node, ctx);
  if (node.clipsContent) props['overflow'] = 'hidden';

  return { props, pseudo, isSvg: Boolean(svgUrl) };
}

function generateRules(node, ctx, parentSelector, parentNode, isRoot, rules) {
  if (!node || node.visible === false) return;
  const className = nodeToClassName(node, ctx.prefix);
  const selector = parentSelector ? `${parentSelector} > .${className}` : `.${className}`;
  const { props, pseudo, isSvg } = nodeProps(node, ctx, { parentNode, isRoot });

  if (Object.keys(props).length > 0) rules.push({ selector, properties: props });
  if (pseudo) rules.push({ selector: `${selector}::before`, properties: pseudo });

  if (node.type === 'TEXT') {
    overrideStyles(node, ctx.vars).forEach((diff, key) => {
      rules.push({ selector: `.${className}__s${key}`, properties: diff });
    });
  }

  if (isSvg || !node.children) return;
  node.children.forEach((child) => generateRules(child, ctx, selector, node, false, rules));
}

function formatRules(rules) {
  return rules
    .map(({ selector, properties }) => {
      const body = Object.entries(properties)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
      return `${selector} {\n${body}\n}`;
    })
    .join('\n\n');
}

function headerComment(options) {
  const safe = (s) => String(s).replace(/\*\//g, '* /');
  const date = (options.date || new Date()).toISOString().slice(0, 10);
  const lines = [`Generated by FigToCSS from "${safe(options.fileName || 'Untitled')}" on ${date}`];
  if (options.headerNote) lines.push(safe(options.headerNote));
  return `/*\n${lines.map((l) => ` * ${l}`).join('\n')}\n */`;
}

/** Generate CSS for the selected Figma nodes. */
export function generateCSS(fileData, selectedNodes, settings, options = {}) {
  const ctx = createContext(settings, options);
  const rules = [];
  resolveSelection(fileData.document, selectedNodes).forEach((node) => {
    generateRules(node, ctx, '', null, true, rules);
  });

  const parts = [headerComment(options)];
  if (options.reset) parts.push(CSS_RESET);
  const root = ctx.vars.rootBlock();
  if (root) parts.push(root);
  if (rules.length > 0) parts.push(formatRules(rules));
  return `${parts.join('\n\n')}\n`;
}

/** Generate HTML mirroring the layer hierarchy of the selected nodes. */
export function generateHTML(fileData, selectedNodes, settings, options = {}) {
  const getSvgUrl = options.getSvgUrl || (() => null);
  const ctx = { prefix: getPrefix(settings), hasSvg: (id) => Boolean(getSvgUrl(id)) };
  return resolveSelection(fileData.document, selectedNodes)
    .map((node) => nodeToHTML(node, ctx))
    .join('');
}
