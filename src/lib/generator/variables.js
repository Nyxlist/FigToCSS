/**
 * CSS custom property registry. When enabled, colors and fonts are replaced
 * with var(--color-N) / var(--font-N) and only used variables are emitted.
 */

export function createVariableRegistry(enabled) {
  const colors = new Map(); // value → name
  const fonts = new Map(); // family → name

  const fontStack = (family) => {
    const safe = String(family)
      .replace(/[\n\r\f]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/</g, '\\3c ');
    return `'${safe}', sans-serif`;
  };

  return {
    color(value) {
      if (!enabled || !value) return value;
      if (!colors.has(value)) colors.set(value, `--color-${colors.size + 1}`);
      return `var(${colors.get(value)})`;
    },
    font(family) {
      if (!enabled) return fontStack(family);
      if (!fonts.has(family)) fonts.set(family, `--font-${fonts.size + 1}`);
      return `var(${fonts.get(family)})`;
    },
    rootBlock() {
      if (colors.size === 0 && fonts.size === 0) return '';
      const lines = [];
      colors.forEach((name, value) => lines.push(`  ${name}: ${value};`));
      fonts.forEach((name, family) => lines.push(`  ${name}: ${fontStack(family)};`));
      return `:root {\n${lines.join('\n')}\n}`;
    },
  };
}
