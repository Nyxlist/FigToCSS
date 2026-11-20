/**
 * Font detection for the selection and Google Fonts URL building.
 */

import { getNodeIndex, walkVisible } from './nodeIndex';

// Known Google Fonts (subset — most common ones)
const GOOGLE_FONTS = new Set([
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
  'Nunito', 'Ubuntu', 'Merriweather', 'Playfair Display', 'Oswald', 'Source Sans Pro',
  'Source Code Pro', 'Noto Sans', 'PT Sans', 'Work Sans', 'Manrope', 'DM Sans',
  'Space Grotesk', 'JetBrains Mono', 'Fira Code', 'IBM Plex Sans', 'IBM Plex Mono',
  'Rubik', 'Quicksand', 'Karla', 'Mulish', 'Inconsolata', 'Barlow', 'Cabin',
  'Libre Franklin', 'Josefin Sans', 'Archivo', 'Overpass', 'Sora', 'Outfit',
  'Plus Jakarta Sans', 'Lexend', 'Red Hat Display', 'Figtree', 'Geist',
  'Albert Sans', 'Space Mono', 'Instrument Sans', 'Satoshi',
]);

/** Fonts used in the selection: [{ family, count, weights, italic, isGoogleFont, included }] */
export function collectFonts(document, selectedNodes) {
  const index = getNodeIndex(document);
  const fonts = new Map(); // family → { count, styles: Set('400' | '400i') }

  const add = (style) => {
    if (!style?.fontFamily) return;
    if (!fonts.has(style.fontFamily)) fonts.set(style.fontFamily, { count: 0, styles: new Set() });
    const entry = fonts.get(style.fontFamily);
    entry.count++;
    entry.styles.add(`${Math.round(style.fontWeight || 400)}${style.italic ? 'i' : ''}`);
  };

  selectedNodes.forEach((sel) => {
    walkVisible(index.get(sel.id), (node) => {
      if (node.type !== 'TEXT') return;
      const base = node.style || {};
      add(base);
      const used = new Set((node.characterStyleOverrides || []).map(String));
      Object.entries(node.styleOverrideTable || {}).forEach(([key, override]) => {
        if (used.has(key) && (override.fontFamily || override.fontWeight || override.italic != null)) {
          add({ ...base, ...override });
        }
      });
    });
  });

  return [...fonts.entries()].map(([family, { count, styles }]) => {
    const variants = [...styles].map((s) => ({ weight: parseInt(s, 10), italic: s.endsWith('i') }));
    return {
      family,
      count,
      weights: [...new Set(variants.map((v) => v.weight))].sort((a, b) => a - b),
      variants,
      italic: variants.some((v) => v.italic),
      isGoogleFont: GOOGLE_FONTS.has(family),
      included: true,
    };
  });
}

/** Google Fonts css2 URL for the included Google fonts, or '' if none. */
export function googleFontsUrl(fontAssets) {
  const fonts = (fontAssets || []).filter((f) => f.included && f.isGoogleFont);
  if (fonts.length === 0) return '';
  const families = fonts.map((f) => {
    const name = encodeURIComponent(f.family).replace(/%20/g, '+');
    const variants = f.variants?.length ? f.variants : f.weights.map((weight) => ({ weight, italic: false }));
    if (!f.italic) {
      const weights = [...new Set(variants.map((v) => v.weight))].sort((a, b) => a - b);
      return `family=${name}:wght@${weights.join(';')}`;
    }
    const tuples = [...new Set(variants.map((v) => `${v.italic ? 1 : 0},${v.weight}`))]
      .sort((a, b) => {
        const [ai, aw] = a.split(',').map(Number);
        const [bi, bw] = b.split(',').map(Number);
        return ai - bi || aw - bw;
      });
    return `family=${name}:ital,wght@${tuples.join(';')}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}
