/**
 * Paints → CSS: colors, background layers (fills), strokes, shadows.
 * Figma paints are bottom-first; CSS background layers are top-first.
 */

import { cssUrl } from './naming';

export function colorToCSS(color, opacity = 1) {
  const r = Math.round((color?.r || 0) * 255);
  const g = Math.round((color?.g || 0) * 255);
  const b = Math.round((color?.b || 0) * 255);
  const a = (color?.a ?? 1) * opacity;
  if (a >= 0.995) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`;
}

function round(n, digits = 2) {
  return Number(n.toFixed(digits));
}

function gradientStops(paint) {
  const opacity = paint.opacity ?? 1;
  return (paint.gradientStops || [])
    .map((s) => `${colorToCSS(s.color, opacity)} ${round(s.position * 100)}%`)
    .join(', ');
}

/** Converts a normalized handle vector to a CSS angle, accounting for box aspect. */
function handleAngle(h0, h1, size) {
  const dx = (h1.x - h0.x) * (size?.width || 1);
  const dy = (h1.y - h0.y) * (size?.height || 1);
  const deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

function handles(paint) {
  return (paint.gradientHandlePositions || []).map((h) => ({ x: h.x ?? h[0], y: h.y ?? h[1] }));
}

function gradientToCSS(paint, size) {
  const h = handles(paint);
  const stops = gradientStops(paint);
  if (!stops) return null;
  switch (paint.type) {
    case 'GRADIENT_LINEAR': {
      const angle = h.length >= 2 ? handleAngle(h[0], h[1], size) : 180;
      return `linear-gradient(${angle}deg, ${stops})`;
    }
    case 'GRADIENT_RADIAL': {
      if (h.length < 1) return `radial-gradient(ellipse, ${stops})`;
      const at = `at ${round(h[0].x * 100)}% ${round(h[0].y * 100)}%`;
      if (h.length >= 3) {
        const rx = Math.hypot(h[1].x - h[0].x, h[1].y - h[0].y) * 100;
        const ry = Math.hypot(h[2].x - h[0].x, h[2].y - h[0].y) * 100;
        return `radial-gradient(ellipse ${round(rx)}% ${round(ry)}% ${at}, ${stops})`;
      }
      return `radial-gradient(ellipse ${at}, ${stops})`;
    }
    case 'GRADIENT_ANGULAR': {
      if (h.length < 2) return `conic-gradient(${stops})`;
      const from = handleAngle(h[0], h[1], size);
      return `conic-gradient(from ${from}deg at ${round(h[0].x * 100)}% ${round(h[0].y * 100)}%, ${stops})`;
    }
    default:
      return null;
  }
}

function imageLayer(paint, image) {
  const layer = { image: cssUrl(image.url), size: 'cover', position: 'center', repeat: 'no-repeat' };
  switch (paint.scaleMode) {
    case 'FIT':
      layer.size = 'contain';
      break;
    case 'TILE': {
      layer.repeat = 'repeat';
      layer.position = '0 0';
      const sf = paint.scalingFactor;
      layer.size = sf && image.width && image.height
        ? `${round(image.width * sf)}px ${round(image.height * sf)}px`
        : 'auto';
      break;
    }
    default: // FILL, CROP
      layer.size = 'cover';
  }
  return layer;
}

/**
 * Applies visible fills as background properties.
 * @param ctx { vars, getImage }
 */
export function applyFills(props, node, ctx) {
  const fills = (node.fills || []).filter((f) => f.visible !== false);
  if (fills.length === 0) return;
  const size = node.absoluteBoundingBox;

  const layers = [];
  for (const paint of [...fills].reverse()) {
    if (paint.type === 'SOLID') {
      layers.push({ solid: colorToCSS(paint.color, paint.opacity ?? 1) });
    } else if (paint.type === 'IMAGE') {
      const image = paint.imageRef ? ctx.getImage(paint.imageRef) : null;
      if (image) layers.push(imageLayer(paint, image));
    } else {
      const gradient = gradientToCSS(paint, size);
      if (gradient) layers.push({ image: gradient, size: 'auto', position: '0 0', repeat: 'no-repeat' });
    }
  }
  if (layers.length === 0) return;

  if (layers.length === 1 && layers[0].solid) {
    props['background-color'] = ctx.vars.color(layers[0].solid);
    return;
  }

  const css = layers.map((l) => (l.solid
    ? { image: `linear-gradient(${l.solid}, ${l.solid})`, size: 'auto', position: '0 0', repeat: 'no-repeat' }
    : l));
  props['background-image'] = css.map((l) => l.image).join(', ');
  if (css.some((l) => l.size !== 'auto')) props['background-size'] = css.map((l) => l.size).join(', ');
  if (css.some((l) => l.position !== '0 0')) props['background-position'] = css.map((l) => l.position).join(', ');
  props['background-repeat'] = css.map((l) => l.repeat).join(', ');
}

/** Strokes → outline (doesn't affect layout), or per-side borders. */
export function applyStrokes(props, node, ctx) {
  if (node.type === 'TEXT') return;
  const stroke = (node.strokes || []).find((s) => s.visible !== false && s.type === 'SOLID');
  if (!stroke) return;
  const color = ctx.vars.color(colorToCSS(stroke.color, stroke.opacity ?? 1));

  if (node.type === 'LINE') {
    props['height'] = `${node.strokeWeight || 1}px`;
    props['background-color'] = color;
    return;
  }

  const style = node.strokeDashes && node.strokeDashes.length > 0 ? 'dashed' : 'solid';
  const sw = node.individualStrokeWeights;
  const uniform = !sw || (sw.top === sw.right && sw.right === sw.bottom && sw.bottom === sw.left);

  if (!uniform) {
    // Borders take layout space; border-box keeps the Figma size.
    props['box-sizing'] = 'border-box';
    if (sw.top > 0) props['border-top'] = `${sw.top}px ${style} ${color}`;
    if (sw.right > 0) props['border-right'] = `${sw.right}px ${style} ${color}`;
    if (sw.bottom > 0) props['border-bottom'] = `${sw.bottom}px ${style} ${color}`;
    if (sw.left > 0) props['border-left'] = `${sw.left}px ${style} ${color}`;
    return;
  }

  const weight = sw ? sw.top : node.strokeWeight ?? 1;
  if (!weight) return;
  props['outline'] = `${weight}px ${style} ${color}`;
  const align = node.strokeAlign || 'INSIDE';
  if (align === 'INSIDE') props['outline-offset'] = `-${weight}px`;
  else if (align === 'CENTER') props['outline-offset'] = `-${round(weight / 2)}px`;
  else props['outline-offset'] = '0';
}

/** Shadows / blurs. DROP_SHADOW on text becomes text-shadow. */
export function applyEffects(props, node) {
  const effects = (node.effects || []).filter((e) => e.visible !== false);
  if (effects.length === 0) return;

  const shadowValue = (s, withSpread) => {
    const x = Math.round(s.offset?.x || 0);
    const y = Math.round(s.offset?.y || 0);
    const blur = Math.round(s.radius || 0);
    const spread = withSpread ? ` ${Math.round(s.spread || 0)}px` : '';
    return `${x}px ${y}px ${blur}px${spread} ${colorToCSS(s.color)}`;
  };

  if (node.type === 'TEXT') {
    const drops = effects.filter((e) => e.type === 'DROP_SHADOW');
    if (drops.length > 0) props['text-shadow'] = drops.map((s) => shadowValue(s, false)).join(', ');
  } else {
    const shadows = effects.filter((e) => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');
    if (shadows.length > 0) {
      props['box-shadow'] = shadows
        .map((s) => `${s.type === 'INNER_SHADOW' ? 'inset ' : ''}${shadowValue(s, true)}`)
        .join(', ');
    }
  }

  const blur = effects.find((e) => e.type === 'LAYER_BLUR');
  if (blur) props['filter'] = `blur(${Math.round(blur.radius)}px)`;
  const bgBlur = effects.find((e) => e.type === 'BACKGROUND_BLUR');
  if (bgBlur) props['backdrop-filter'] = `blur(${Math.round(bgBlur.radius)}px)`;
}
