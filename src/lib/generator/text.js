/**
 * TEXT nodes → typography CSS, plus mixed-style runs
 * (characterStyleOverrides + styleOverrideTable) → span rules.
 */

import { colorToCSS } from './paint';
import { createVariableRegistry } from './variables';
import { escapeHTML } from './naming';

const ALIGN = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
const CASE = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' };
const DECORATION = { UNDERLINE: 'underline', STRIKETHROUGH: 'line-through' };
const VERTICAL = { CENTER: 'center', BOTTOM: 'flex-end' };
// Values that undo a base property when an override removes it.
const RESETS = {
  'font-style': 'normal',
  'text-decoration': 'none',
  'text-transform': 'none',
  'letter-spacing': 'normal',
};
const plainVars = createVariableRegistry(false);

function round(n, digits = 2) {
  return Number(Number(n).toFixed(digits));
}

function lineHeight(style) {
  if (style.lineHeightUnit === 'INTRINSIC_%') return 'normal';
  if (style.lineHeightUnit === 'FONT_SIZE_%' && style.lineHeightPercentFontSize != null) {
    return String(round(style.lineHeightPercentFontSize / 100, 3));
  }
  if (style.lineHeightPx) return `${round(style.lineHeightPx)}px`;
  return null;
}

/** Font-related properties for a (possibly merged) TypeStyle. */
function fontProps(style, vars) {
  const p = {};
  if (style.fontFamily) p['font-family'] = vars.font(style.fontFamily);
  if (style.fontSize) p['font-size'] = `${round(style.fontSize)}px`;
  if (style.fontWeight) p['font-weight'] = String(style.fontWeight);
  if (style.italic) p['font-style'] = 'italic';
  const lh = lineHeight(style);
  if (lh) p['line-height'] = lh;
  if (style.letterSpacing) p['letter-spacing'] = `${round(style.letterSpacing, 1)}px`;
  if (DECORATION[style.textDecoration]) p['text-decoration'] = DECORATION[style.textDecoration];
  if (CASE[style.textCase]) p['text-transform'] = CASE[style.textCase];
  return p;
}

function solidColor(fills) {
  const fill = (fills || []).find((f) => f.visible !== false && f.type === 'SOLID');
  return fill ? colorToCSS(fill.color, fill.opacity ?? 1) : null;
}

/** Applies typography and text-box sizing to a TEXT node's props. */
export function applyText(props, node, ctx) {
  const style = node.style || {};
  Object.assign(props, fontProps(style, ctx.vars));
  if (ALIGN[style.textAlignHorizontal]) {
    props['text-align'] = ALIGN[style.textAlignHorizontal];
  }
  const color = solidColor(node.fills);
  if (color) props['color'] = ctx.vars.color(color);

  const autoResize = style.textAutoResize || node.textAutoResize;
  props['white-space'] = autoResize === 'WIDTH_AND_HEIGHT' ? 'pre' : 'pre-wrap';
  if (autoResize === 'WIDTH_AND_HEIGHT') {
    delete props['width'];
    delete props['height'];
  } else if (autoResize === 'HEIGHT') {
    delete props['height'];
  }

  if (VERTICAL[style.textAlignVertical]) {
    props['display'] = 'flex';
    props['flex-direction'] = 'column';
    props['justify-content'] = VERTICAL[style.textAlignVertical];
  }
}

/** Override key → CSS props that differ from the base style (empty diffs dropped). */
export function overrideStyles(node, vars = plainVars) {
  const table = node.styleOverrideTable || {};
  const base = node.style || {};
  const baseProps = fontProps(base, vars);
  const baseColor = solidColor(node.fills);
  const result = new Map();

  for (const [key, override] of Object.entries(table)) {
    if (!override || key === '0') continue;
    const merged = fontProps({ ...base, ...override }, vars);
    const diff = {};
    for (const [prop, value] of Object.entries(merged)) {
      if (baseProps[prop] !== value) diff[prop] = value;
    }
    for (const prop of Object.keys(baseProps)) {
      if (!(prop in merged) && RESETS[prop]) diff[prop] = RESETS[prop];
    }
    if (override.fills) {
      const color = solidColor(override.fills);
      if (color && color !== baseColor) diff['color'] = vars.color(color);
    }
    if (Object.keys(diff).length > 0) result.set(key, diff);
  }
  return result;
}

/**
 * Splits characters into runs of equal override key.
 * characterStyleOverrides indexes are treated as UTF-16 code units (JS string
 * indexes); the REST docs don't state the unit, so to stay safe a surrogate
 * pair (e.g. emoji) is never split: it stays in the run of its first unit.
 */
function textRuns(node) {
  const chars = node.characters ?? node.name ?? '';
  const overrides = node.characterStyleOverrides || [];
  const runs = [];
  for (let i = 0; i < chars.length; i++) {
    const key = String(overrides[i] || 0);
    let unit = chars[i];
    const code = chars.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < chars.length) {
      const next = chars.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        unit += chars[i + 1];
        i++;
      }
    }
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.text += unit;
    else runs.push({ key, text: unit });
  }
  return runs;
}

/** Inner HTML for a TEXT node: escaped text with styled spans. */
export function textInnerHTML(node, className) {
  const styled = overrideStyles(node);
  const runs = textRuns(node);
  let hasSpans = false;
  const html = runs
    .map(({ key, text }) => {
      if (!styled.has(key)) return escapeHTML(text);
      hasSpans = true;
      return `<span class="${className}__s${key}">${escapeHTML(text)}</span>`;
    })
    .join('');
  // Vertically aligned text is a flex column; keep runs in one flex item.
  const vertical = VERTICAL[node.style?.textAlignVertical];
  return hasSpans && vertical ? `<span>${html}</span>` : html;
}
