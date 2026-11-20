/**
 * Positioning, sizing and auto layout → CSS.
 *
 * - Flexbox mode: auto layout frames → flex; their children are flex items
 *   (sized via layoutSizing*, falling back to layoutGrow / layoutAlign),
 *   except layoutPositioning ABSOLUTE children, which are absolutely placed.
 * - Children of non-auto-layout parents are absolutely placed using constraints.
 * - Absolute mode: every non-root node is absolutely placed, no flex output.
 */

export function hasAutoLayout(node) {
  return Boolean(node && node.layoutMode && node.layoutMode !== 'NONE');
}

const px = (n) => `${Math.round(n)}px`;

function mapAlignment(value) {
  switch (value) {
    case 'CENTER': return 'center';
    case 'MAX': return 'flex-end';
    case 'SPACE_BETWEEN': return 'space-between';
    case 'BASELINE': return 'baseline';
    default: return 'flex-start';
  }
}

function centerCalc(offset) {
  const o = Math.round(offset);
  if (o === 0) return '50%';
  return `calc(50% ${o < 0 ? '-' : '+'} ${Math.abs(o)}px)`;
}

function applyConstraints(props, node, parentBBox, constraints) {
  const bbox = node.absoluteBoundingBox;
  const horizontal = constraints.horizontal || 'LEFT';
  const vertical = constraints.vertical || 'TOP';

  const nodeW = Math.round(bbox.width);
  const nodeH = Math.round(bbox.height);
  const parentW = Math.round(parentBBox.width) || 1;
  const parentH = Math.round(parentBBox.height) || 1;
  const left = Math.round(bbox.x - parentBBox.x);
  const top = Math.round(bbox.y - parentBBox.y);
  const right = parentW - left - nodeW;
  const bottom = parentH - top - nodeH;
  const translate = { x: false, y: false };

  switch (horizontal) {
    case 'RIGHT':
      props['right'] = `${right}px`;
      props['width'] = `${nodeW}px`;
      break;
    case 'CENTER':
      // Keep the node's offset from the parent's center.
      props['left'] = centerCalc(left + nodeW / 2 - parentW / 2);
      props['width'] = `${nodeW}px`;
      translate.x = true;
      break;
    case 'LEFT_RIGHT':
      props['left'] = `${left}px`;
      props['right'] = `${right}px`;
      break;
    case 'SCALE':
      props['left'] = `${((left / parentW) * 100).toFixed(2)}%`;
      props['width'] = `${((nodeW / parentW) * 100).toFixed(2)}%`;
      break;
    default:
      props['left'] = `${left}px`;
      props['width'] = `${nodeW}px`;
  }

  switch (vertical) {
    case 'BOTTOM':
      props['bottom'] = `${bottom}px`;
      props['height'] = `${nodeH}px`;
      break;
    case 'CENTER':
      props['top'] = centerCalc(top + nodeH / 2 - parentH / 2);
      props['height'] = `${nodeH}px`;
      translate.y = true;
      break;
    case 'TOP_BOTTOM':
      props['top'] = `${top}px`;
      props['bottom'] = `${bottom}px`;
      break;
    case 'SCALE':
      props['top'] = `${((top / parentH) * 100).toFixed(2)}%`;
      props['height'] = `${((nodeH / parentH) * 100).toFixed(2)}%`;
      break;
    default:
      props['top'] = `${top}px`;
      props['height'] = `${nodeH}px`;
  }

  if (translate.x && translate.y) props['transform'] = 'translate(-50%, -50%)';
  else if (translate.x) props['transform'] = 'translateX(-50%)';
  else if (translate.y) props['transform'] = 'translateY(-50%)';
}

/** Resolves FIXED / FILL / HUG for both axes of a flex child. */
function childSizing(node, parent) {
  const horizontalParent = parent.layoutMode === 'HORIZONTAL';
  const mainFill = (node.layoutGrow ?? 0) >= 1 ? 'FILL' : 'FIXED';
  const counterFill = node.layoutAlign === 'STRETCH' ? 'FILL' : 'FIXED';
  return {
    h: node.layoutSizingHorizontal || (horizontalParent ? mainFill : counterFill),
    v: node.layoutSizingVertical || (horizontalParent ? counterFill : mainFill),
  };
}

function applyFlexChild(props, node, parent, includeDimensions) {
  const bbox = node.absoluteBoundingBox;
  const { h, v } = childSizing(node, parent);
  const mainIsH = parent.layoutMode === 'HORIZONTAL';

  const axis = (sizing, isMain, dimension, value) => {
    if (sizing === 'FILL') {
      if (isMain) props['flex'] = '1 1 0';
      else props['align-self'] = 'stretch';
      if (isMain) props[dimension === 'width' ? 'min-width' : 'min-height'] = '0';
    } else if (sizing === 'FIXED') {
      if (includeDimensions && bbox) props[dimension] = px(value);
      if (isMain) props['flex-shrink'] = '0';
    }
  };

  axis(h, mainIsH, 'width', bbox?.width);
  axis(v, !mainIsH, 'height', bbox?.height);
}

function applyAutoLayoutContainer(props, node) {
  props['display'] = 'flex';
  props['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
  props['justify-content'] = mapAlignment(node.primaryAxisAlignItems);
  props['align-items'] = mapAlignment(node.counterAxisAlignItems);

  if (node.primaryAxisAlignItems !== 'SPACE_BETWEEN' && node.itemSpacing > 0) {
    props['gap'] = `${node.itemSpacing}px`;
  }

  const pt = node.paddingTop || 0;
  const pr = node.paddingRight || 0;
  const pb = node.paddingBottom || 0;
  const pl = node.paddingLeft || 0;
  if (pt || pr || pb || pl) {
    if (pt === pr && pr === pb && pb === pl) props['padding'] = `${pt}px`;
    else if (pt === pb && pl === pr) props['padding'] = `${pt}px ${pr}px`;
    else props['padding'] = `${pt}px ${pr}px ${pb}px ${pl}px`;
  }

  if (node.layoutWrap === 'WRAP') {
    props['flex-wrap'] = 'wrap';
    if (node.counterAxisSpacing > 0) props['row-gap'] = `${node.counterAxisSpacing}px`;
  }
}

/**
 * Applies positioning, size and container layout for one node.
 * @param ctx { settings, absoluteMode }
 * @param context { parentNode, isRoot }
 */
export function applyLayout(props, node, ctx, { parentNode, isRoot }) {
  const { includeDimensions } = ctx.settings;
  const bbox = node.absoluteBoundingBox;
  const parentBBox = parentNode?.absoluteBoundingBox;
  const flexParent = !ctx.absoluteMode && hasAutoLayout(parentNode);

  if (isRoot) {
    if (includeDimensions && bbox) {
      props['width'] = px(bbox.width);
      props['height'] = px(bbox.height);
    }
    props['position'] = 'relative';
  } else if (flexParent && node.layoutPositioning !== 'ABSOLUTE') {
    applyFlexChild(props, node, parentNode, includeDimensions);
  } else {
    props['position'] = 'absolute';
    if (bbox && parentBBox) {
      // Constraints don't apply to items placed inside auto layout.
      const inAutoLayout = hasAutoLayout(parentNode) && node.layoutPositioning !== 'ABSOLUTE';
      applyConstraints(props, node, parentBBox, inAutoLayout ? {} : node.constraints || {});
    } else if (includeDimensions && bbox) {
      props['width'] = px(bbox.width);
      props['height'] = px(bbox.height);
    }
  }

  const hasChildren = node.children && node.children.length > 0;
  if (!ctx.absoluteMode && hasAutoLayout(node)) {
    applyAutoLayoutContainer(props, node);
    const absoluteChild = hasChildren && node.children.some((c) => c.layoutPositioning === 'ABSOLUTE');
    if (absoluteChild && !props['position']) props['position'] = 'relative';
  } else if (hasChildren && !props['position']) {
    props['position'] = 'relative';
  }
}

/** Corner radius, and simple shape clip paths when no SVG is available. */
export function applyShape(props, node, hasSvg) {
  if (node.type === 'ELLIPSE') {
    props['border-radius'] = '50%';
  } else if (node.cornerRadius > 0) {
    props['border-radius'] = `${node.cornerRadius}px`;
  } else if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    if (tl === tr && tr === br && br === bl) {
      if (tl > 0) props['border-radius'] = `${tl}px`;
    } else {
      props['border-radius'] = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }

  if (hasSvg) return;

  if (node.type === 'REGULAR_POLYGON' || node.type === 'STAR') {
    const star = node.type === 'STAR';
    const count = node.pointCount || (star ? 5 : 3);
    const inner = node.innerRadius || 0.382;
    const steps = star ? count * 2 : count;
    const points = [];
    for (let i = 0; i < steps; i++) {
      const angle = (i * 2 * Math.PI) / steps - Math.PI / 2;
      const radius = star && i % 2 === 1 ? 50 * inner : 50;
      points.push(`${(50 + radius * Math.cos(angle)).toFixed(1)}% ${(50 + radius * Math.sin(angle)).toFixed(1)}%`);
    }
    props['clip-path'] = `polygon(${points.join(', ')})`;
  }
}

/** Rotation, merged with any centering transform. */
export function applyRotation(props, node) {
  if (!node.rotation) return;
  const value = `rotate(${(-node.rotation).toFixed(1)}deg)`;
  props['transform'] = props['transform'] ? `${props['transform']} ${value}` : value;
}
