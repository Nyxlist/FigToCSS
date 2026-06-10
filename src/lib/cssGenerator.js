/**
 * Figma Node → CSS Generator
 *
 * Converts Figma node trees into CSS that replicates the design pixel-accurately.
 *
 * Key positioning rules:
 * 1. Auto-layout frames → display:flex with gap, padding, alignment
 * 2. Children of auto-layout → flex items (width/height from bbox, flex-grow from layoutGrow)
 * 3. Non-auto-layout frames → position:relative container
 * 4. Children of non-auto-layout → position:absolute with top/left computed from parent bbox
 * 5. Constraints (LEFT, RIGHT, CENTER, SCALE, TOP_BOTTOM, etc.) map to CSS positioning
 *
 * CSS and HTML share the same nodeToClassName() function (ID-based, deterministic)
 * so selectors and class attributes always correspond exactly.
 */

// ─── NAMING ────────────────────────────────────────────────────────────────

function sanitize(str) {
  return str
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/^(\d)/, '_$1') || 'layer';
}

function nodeToClassName(node, prefix = '') {
  const base = sanitize(node.name);
  const idSuffix = node.id.replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}${base}_${idSuffix}`;
}

export function getClassName(node, settings) {
  const prefix = settings.namingMode === 'custom' ? settings.customPrefix : '';
  return nodeToClassName(node, prefix);
}

// ─── COLOR UTILITIES ───────────────────────────────────────────────────────

function figmaColorToCSS(color, opacity = 1) {
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  const a = (color.a ?? 1) * opacity;
  if (a >= 0.995) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function gradientAngle(handles) {
  if (!handles || handles.length < 2) return '180deg';
  const dx = handles[1][0] - handles[0][0];
  const dy = handles[1][1] - handles[0][1];
  const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90);
  return `${((angle % 360) + 360) % 360}deg`;
}

function paintToBackground(paint) {
  if (paint.visible === false) return null;
  switch (paint.type) {
    case 'SOLID':
      return figmaColorToCSS(paint.color, paint.opacity ?? 1);
    case 'GRADIENT_LINEAR': {
      const stops = paint.gradientStops
        .map((s) => `${figmaColorToCSS(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `linear-gradient(${gradientAngle(paint.gradientHandlePositions)}, ${stops})`;
    }
    case 'GRADIENT_RADIAL': {
      const stops = paint.gradientStops
        .map((s) => `${figmaColorToCSS(s.color)} ${Math.round(s.position * 100)}%`)
        .join(', ');
      return `radial-gradient(circle, ${stops})`;
    }
    default:
      return null;
  }
}

// ─── LAYOUT HELPERS ────────────────────────────────────────────────────────

function mapAlignment(value) {
  switch (value) {
    case 'MIN': return 'flex-start';
    case 'CENTER': return 'center';
    case 'MAX': return 'flex-end';
    case 'SPACE_BETWEEN': return 'space-between';
    default: return 'flex-start';
  }
}

function hasAutoLayout(node) {
  return node && node.layoutMode && node.layoutMode !== 'NONE';
}

// ─── CONSTRAINT-BASED POSITIONING ──────────────────────────────────────────

/**
 * For children of non-auto-layout frames, Figma uses constraints to define
 * how elements are positioned relative to their parent. We convert these
 * to CSS positioning properties.
 */
function applyConstraints(props, node, parentBBox) {
  const bbox = node.absoluteBoundingBox;
  if (!bbox || !parentBBox) return;

  const constraints = node.constraints || {};
  const horizontal = constraints.horizontal || 'LEFT';
  const vertical = constraints.vertical || 'TOP';

  const nodeW = Math.round(bbox.width);
  const nodeH = Math.round(bbox.height);
  const parentW = Math.round(parentBBox.width);
  const parentH = Math.round(parentBBox.height);

  const top = Math.round(bbox.y - parentBBox.y);
  const left = Math.round(bbox.x - parentBBox.x);
  const right = parentW - left - nodeW;
  const bottom = parentH - top - nodeH;

  // Horizontal constraint
  switch (horizontal) {
    case 'LEFT':
      props['left'] = `${left}px`;
      props['width'] = `${nodeW}px`;
      break;
    case 'RIGHT':
      props['right'] = `${right}px`;
      props['width'] = `${nodeW}px`;
      break;
    case 'CENTER':
      // Center horizontally
      props['left'] = `${left}px`;
      props['width'] = `${nodeW}px`;
      break;
    case 'LEFT_RIGHT':
      // Stretch: pin both sides
      props['left'] = `${left}px`;
      props['right'] = `${right}px`;
      break;
    case 'SCALE':
      // Percentage-based
      props['left'] = `${((left / parentW) * 100).toFixed(2)}%`;
      props['width'] = `${((nodeW / parentW) * 100).toFixed(2)}%`;
      break;
    default:
      props['left'] = `${left}px`;
      props['width'] = `${nodeW}px`;
  }

  // Vertical constraint
  switch (vertical) {
    case 'TOP':
      props['top'] = `${top}px`;
      if (!props['height']) props['height'] = `${nodeH}px`;
      break;
    case 'BOTTOM':
      props['bottom'] = `${bottom}px`;
      if (!props['height']) props['height'] = `${nodeH}px`;
      break;
    case 'CENTER':
      props['top'] = `${top}px`;
      if (!props['height']) props['height'] = `${nodeH}px`;
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
      if (!props['height']) props['height'] = `${nodeH}px`;
  }
}

// ─── CSS GENERATION FOR A SINGLE NODE ──────────────────────────────────────

function generateNodeCSS(node, settings, context) {
  const { parentNode, parentBBox, isRootSelected } = context;
  const props = {};
  const bbox = node.absoluteBoundingBox;
  const parentIsAutoLayout = hasAutoLayout(parentNode);

  // ═══ POSITIONING & DIMENSIONS ═══

  if (isRootSelected) {
    // Root: explicit size, position:relative if not auto-layout
    if (settings.includeDimensions && bbox) {
      props['width'] = `${Math.round(bbox.width)}px`;
      props['height'] = `${Math.round(bbox.height)}px`;
    }
    if (!hasAutoLayout(node)) {
      props['position'] = 'relative';
    }
  } else if (parentIsAutoLayout) {
    // ─── FLEX CHILD ───
    const layoutGrow = node.layoutGrow ?? 0;
    const layoutAlign = node.layoutAlign || 'INHERIT';
    const parentDir = parentNode.layoutMode; // HORIZONTAL or VERTICAL

    if (settings.includeDimensions && bbox) {
      const w = Math.round(bbox.width);
      const h = Math.round(bbox.height);

      // Always set both width and height for accurate sizing
      // Flex layout will override as needed
      if (parentDir === 'HORIZONTAL') {
        if (layoutGrow === 1) {
          props['flex'] = '1';
        } else {
          props['width'] = `${w}px`;
        }
        if (layoutAlign === 'STRETCH') {
          props['align-self'] = 'stretch';
        } else {
          props['height'] = `${h}px`;
        }
      } else {
        if (layoutGrow === 1) {
          props['flex'] = '1';
        } else {
          props['height'] = `${h}px`;
        }
        if (layoutAlign === 'STRETCH') {
          props['align-self'] = 'stretch';
        } else {
          props['width'] = `${w}px`;
        }
      }

      // For flex children that don't grow but need both dimensions
      // (e.g. an icon or image inside a row)
      if (layoutGrow !== 1 && layoutAlign !== 'STRETCH') {
        if (!props['width']) props['width'] = `${w}px`;
        if (!props['height']) props['height'] = `${h}px`;
      }
    }
  } else {
    // ─── ABSOLUTE CHILD (non-auto-layout parent) ───
    props['position'] = 'absolute';
    if (bbox && parentBBox) {
      applyConstraints(props, node, parentBBox);
    } else if (settings.includeDimensions && bbox) {
      props['width'] = `${Math.round(bbox.width)}px`;
      props['height'] = `${Math.round(bbox.height)}px`;
    }
  }

  // ═══ FLEX LAYOUT (if this node is an auto-layout container) ═══

  if (settings.layoutMethod === 'flexbox' && hasAutoLayout(node)) {
    props['display'] = 'flex';
    props['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';

    if (node.primaryAxisAlignItems) {
      props['justify-content'] = mapAlignment(node.primaryAxisAlignItems);
    }
    if (node.counterAxisAlignItems) {
      props['align-items'] = mapAlignment(node.counterAxisAlignItems);
    }
    if (node.itemSpacing != null && node.itemSpacing > 0) {
      props['gap'] = `${node.itemSpacing}px`;
    }

    const pt = node.paddingTop || 0;
    const pr = node.paddingRight || 0;
    const pb = node.paddingBottom || 0;
    const pl = node.paddingLeft || 0;
    if (pt || pr || pb || pl) {
      if (pt === pr && pr === pb && pb === pl) {
        props['padding'] = `${pt}px`;
      } else if (pt === pb && pl === pr) {
        props['padding'] = `${pt}px ${pr}px`;
      } else {
        props['padding'] = `${pt}px ${pr}px ${pb}px ${pl}px`;
      }
    }

    if (node.layoutWrap === 'WRAP') {
      props['flex-wrap'] = 'wrap';
    }
  } else if (!isRootSelected && !parentIsAutoLayout && node.children && node.children.length > 0) {
    // Non-auto-layout frame that has children needs position:relative
    // (it's already position:absolute from the block above, which establishes
    // a containing block, so we don't need to add relative again)
  } else if (isRootSelected && !hasAutoLayout(node)) {
    // Already handled
  }

  // If this node has children but no auto-layout, it needs to be a
  // positioning context for its absolutely-positioned children.
  // position:absolute already creates a containing block, so we only
  // need to add position:relative when the node doesn't already have position set.
  if (!hasAutoLayout(node) && node.children && node.children.length > 0) {
    if (!props['position']) {
      props['position'] = 'relative';
    }
  }

  // ═══ BACKGROUND ═══

  if (node.fills && node.fills.length > 0) {
    const visibleFills = node.fills.filter((f) => f.visible !== false);
    if (visibleFills.length > 0) {
      const bgValues = visibleFills.map(paintToBackground).filter(Boolean);
      if (bgValues.length === 1) {
        if (bgValues[0].includes('gradient')) {
          props['background'] = bgValues[0];
        } else {
          props['background-color'] = bgValues[0];
        }
      } else if (bgValues.length > 1) {
        props['background'] = bgValues.join(', ');
      }
    }
  }

  // ═══ BORDER ═══

  if (node.strokes && node.strokes.length > 0) {
    const visibleStrokes = node.strokes.filter((s) => s.visible !== false);
    if (visibleStrokes.length > 0 && visibleStrokes[0].type === 'SOLID') {
      const color = figmaColorToCSS(visibleStrokes[0].color, visibleStrokes[0].opacity ?? 1);
      const weight = node.strokeWeight || 1;

      if (node.individualStrokeWeights) {
        const sw = node.individualStrokeWeights;
        if (sw.top === sw.bottom && sw.left === sw.right && sw.top === sw.left) {
          props['border'] = `${sw.top}px solid ${color}`;
        } else {
          if (sw.top > 0) props['border-top'] = `${sw.top}px solid ${color}`;
          if (sw.right > 0) props['border-right'] = `${sw.right}px solid ${color}`;
          if (sw.bottom > 0) props['border-bottom'] = `${sw.bottom}px solid ${color}`;
          if (sw.left > 0) props['border-left'] = `${sw.left}px solid ${color}`;
        }
      } else {
        props['border'] = `${weight}px solid ${color}`;
      }
    }
  }

  // ═══ BORDER RADIUS ═══

  if (node.type === 'ELLIPSE') {
    // Ellipses are always fully rounded
    props['border-radius'] = '50%';
  } else if (node.cornerRadius != null && node.cornerRadius > 0) {
    props['border-radius'] = `${node.cornerRadius}px`;
  } else if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    if (tl === tr && tr === br && br === bl) {
      if (tl > 0) props['border-radius'] = `${tl}px`;
    } else {
      props['border-radius'] = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }

  // ═══ SHAPE-SPECIFIC STYLES ═══

  // Regular polygons (triangles, hexagons, etc.) use clip-path
  if (node.type === 'REGULAR_POLYGON') {
    const pointCount = node.pointCount || 3;
    const points = [];
    for (let i = 0; i < pointCount; i++) {
      const angle = (i * 2 * Math.PI) / pointCount - Math.PI / 2;
      const x = 50 + 50 * Math.cos(angle);
      const y = 50 + 50 * Math.sin(angle);
      points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
    }
    props['clip-path'] = `polygon(${points.join(', ')})`;
  }

  // Stars use clip-path
  if (node.type === 'STAR') {
    const pointCount = node.pointCount || 5;
    const innerRadius = node.innerRadius || 0.382; // Figma default
    const points = [];
    for (let i = 0; i < pointCount * 2; i++) {
      const angle = (i * Math.PI) / pointCount - Math.PI / 2;
      const radius = i % 2 === 0 ? 50 : 50 * innerRadius;
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
    }
    props['clip-path'] = `polygon(${points.join(', ')})`;
  }

  // Lines
  if (node.type === 'LINE') {
    // A line is essentially a thin rectangle
    if (!props['height'] || props['height'] === '0px') {
      props['height'] = '1px';
    }
    if (node.strokes && node.strokes.length > 0) {
      const stroke = node.strokes.find((s) => s.visible !== false);
      if (stroke && stroke.type === 'SOLID') {
        props['background-color'] = figmaColorToCSS(stroke.color, stroke.opacity ?? 1);
      }
    }
  }

  // Vectors — just render as a box with their fill (best CSS can do)
  // The actual vector path can't be represented in CSS

  // ═══ ROTATION ═══

  if (node.rotation && node.rotation !== 0) {
    // Figma rotation is in degrees, counter-clockwise
    props['transform'] = `rotate(${(-node.rotation).toFixed(1)}deg)`;
  }

  // ═══ EFFECTS ═══

  if (node.effects && node.effects.length > 0) {
    const shadows = node.effects.filter(
      (e) => (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false
    );
    if (shadows.length > 0) {
      props['box-shadow'] = shadows
        .map((s) => {
          const x = Math.round(s.offset?.x || 0);
          const y = Math.round(s.offset?.y || 0);
          const blur = Math.round(s.radius || 0);
          const spread = Math.round(s.spread || 0);
          const color = figmaColorToCSS(s.color);
          const inset = s.type === 'INNER_SHADOW' ? 'inset ' : '';
          return `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`;
        })
        .join(', ');
    }

    const blurs = node.effects.filter((e) => e.type === 'LAYER_BLUR' && e.visible !== false);
    if (blurs.length > 0) {
      props['filter'] = `blur(${Math.round(blurs[0].radius)}px)`;
    }

    const bgBlurs = node.effects.filter((e) => e.type === 'BACKGROUND_BLUR' && e.visible !== false);
    if (bgBlurs.length > 0) {
      props['backdrop-filter'] = `blur(${Math.round(bgBlurs[0].radius)}px)`;
    }
  }

  // ═══ OPACITY ═══

  if (node.opacity != null && node.opacity < 1) {
    props['opacity'] = node.opacity.toFixed(2);
  }

  // ═══ BLEND MODE ═══

  if (node.blendMode && node.blendMode !== 'PASS_THROUGH' && node.blendMode !== 'NORMAL') {
    const blendMap = {
      MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay',
      DARKEN: 'darken', LIGHTEN: 'lighten',
      COLOR_DODGE: 'color-dodge', COLOR_BURN: 'color-burn',
      HARD_LIGHT: 'hard-light', SOFT_LIGHT: 'soft-light',
      DIFFERENCE: 'difference', EXCLUSION: 'exclusion',
      HUE: 'hue', SATURATION: 'saturation',
      COLOR: 'color', LUMINOSITY: 'luminosity',
    };
    if (blendMap[node.blendMode]) {
      props['mix-blend-mode'] = blendMap[node.blendMode];
    }
  }

  // ═══ TYPOGRAPHY ═══

  if (node.type === 'TEXT') {
    const style = node.style || {};
    if (style.fontFamily) props['font-family'] = `'${style.fontFamily}', sans-serif`;
    if (style.fontSize) props['font-size'] = `${style.fontSize}px`;
    if (style.fontWeight) props['font-weight'] = style.fontWeight;
    if (style.lineHeightPx) props['line-height'] = `${Math.round(style.lineHeightPx)}px`;
    if (style.letterSpacing && style.letterSpacing !== 0) {
      props['letter-spacing'] = `${style.letterSpacing.toFixed(1)}px`;
    }
    if (style.textAlignHorizontal) {
      const alignMap = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
      if (alignMap[style.textAlignHorizontal]) {
        props['text-align'] = alignMap[style.textAlignHorizontal];
      }
    }
    if (style.textDecoration === 'UNDERLINE') {
      props['text-decoration'] = 'underline';
    } else if (style.textDecoration === 'STRIKETHROUGH') {
      props['text-decoration'] = 'line-through';
    }
    if (style.textCase === 'UPPER') {
      props['text-transform'] = 'uppercase';
    } else if (style.textCase === 'LOWER') {
      props['text-transform'] = 'lowercase';
    }

    // Text color from fills
    if (node.fills && node.fills.length > 0) {
      const visibleFill = node.fills.find((f) => f.visible !== false && f.type === 'SOLID');
      if (visibleFill) {
        props['color'] = figmaColorToCSS(visibleFill.color, visibleFill.opacity ?? 1);
        delete props['background-color'];
      }
    }
  }

  // ═══ OVERFLOW ═══

  if (node.clipsContent) {
    props['overflow'] = 'hidden';
  }

  return props;
}

// ─── VARIABLE EXTRACTION ───────────────────────────────────────────────────

function extractVariables(nodes) {
  const colors = new Map();
  const fonts = new Set();

  function traverse(node) {
    if (node.fills) {
      node.fills.forEach((fill) => {
        if (fill.type === 'SOLID' && fill.visible !== false) {
          const color = figmaColorToCSS(fill.color);
          if (!colors.has(color)) {
            colors.set(color, `--color-${colors.size + 1}`);
          }
        }
      });
    }
    if (node.style?.fontFamily) fonts.add(node.style.fontFamily);
    if (node.children) node.children.forEach(traverse);
  }

  nodes.forEach(traverse);
  return { colors, fonts };
}

// ─── RECURSIVE CSS GENERATION ──────────────────────────────────────────────

function generateRecursive(node, settings, parentSelector, parentNode, parentBBox, isRootSelected, imageMap) {
  const prefix = settings.namingMode === 'custom' ? settings.customPrefix : '';
  const className = nodeToClassName(node, prefix);
  const selector = parentSelector ? `${parentSelector} > .${className}` : `.${className}`;

  const context = { parentNode, parentBBox, isRootSelected };
  const cssProps = generateNodeCSS(node, settings, context);

  // Add background-image for nodes with IMAGE fills that are in imageMap
  if (imageMap && imageMap.has(node.id)) {
    const imgUrl = imageMap.get(node.id);
    if (imgUrl) {
      props_addImageBg(cssProps, imgUrl, node);
    }
  }

  let rules = [];

  if (Object.keys(cssProps).length > 0) {
    rules.push({ selector, properties: cssProps });
  }

  if (node.children) {
    node.children.forEach((child) => {
      if (child.visible === false) return;
      const childRules = generateRecursive(
        child, settings, selector, node, node.absoluteBoundingBox, false, imageMap
      );
      rules = rules.concat(childRules);
    });
  }

  return rules;
}

/**
 * Add background-image CSS for image fills.
 */
function props_addImageBg(props, url, node) {
  // Determine how the image should be rendered
  const imageFill = node.fills?.find((f) => f.type === 'IMAGE' && f.visible !== false);
  const scaleMode = imageFill?.scaleMode || 'FILL';

  props['background-image'] = `url('${url}')`;
  props['background-repeat'] = 'no-repeat';

  switch (scaleMode) {
    case 'FILL':
      props['background-size'] = 'cover';
      props['background-position'] = 'center';
      break;
    case 'FIT':
      props['background-size'] = 'contain';
      props['background-position'] = 'center';
      break;
    case 'CROP':
      props['background-size'] = 'cover';
      props['background-position'] = 'center';
      break;
    case 'TILE':
      props['background-size'] = 'auto';
      props['background-repeat'] = 'repeat';
      break;
    default:
      props['background-size'] = 'cover';
      props['background-position'] = 'center';
  }

  // Remove solid background-color if image is present (image takes priority)
  delete props['background-color'];
  delete props['background'];
}

function formatCSS(rules) {
  return rules
    .map(({ selector, properties }) => {
      const propsStr = Object.entries(properties)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
      return `${selector} {\n${propsStr}\n}`;
    })
    .join('\n\n');
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────

export function generateCSS(fileData, selectedNodeIds, settings, imageAssets = []) {
  const allRules = [];
  const variables = { colors: new Map(), fonts: new Set() };

  // Build a map of nodeId → imageUrl for included images
  const imageMap = new Map();
  imageAssets.forEach((asset) => {
    if (asset.included && asset.url) {
      imageMap.set(asset.nodeId, asset.url);
    }
  });

  function findNode(node, id) {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  const selectedNodes = selectedNodeIds
    .map((sel) => findNode(fileData.document, sel.id))
    .filter(Boolean);

  if (settings.includeVariables) {
    const vars = extractVariables(selectedNodes);
    variables.colors = vars.colors;
    variables.fonts = vars.fonts;
  }

  selectedNodes.forEach((node) => {
    const rules = generateRecursive(node, settings, '', null, null, true, imageMap);
    allRules.push(...rules);
  });

  let output = '';

  if (settings.includeVariables && (variables.colors.size > 0 || variables.fonts.size > 0)) {
    let varsBlock = ':root {\n';
    variables.colors.forEach((varName, colorValue) => {
      varsBlock += `  ${varName}: ${colorValue};\n`;
    });
    let fontIdx = 1;
    variables.fonts.forEach((font) => {
      varsBlock += `  --font-${fontIdx}: '${font}', sans-serif;\n`;
      fontIdx++;
    });
    varsBlock += '}\n\n';
    output += varsBlock;
  }

  output += formatCSS(allRules);
  return output;
}

/**
 * Generate HTML mirroring the Figma layer hierarchy.
 * Uses the same nodeToClassName() so classes always match CSS selectors.
 * Inserts <img> tags for nodes that have included image assets.
 */
export function generateHTML(fileData, selectedNodeIds, settings, imageAssets = []) {
  // Build image map
  const imageMap = new Map();
  imageAssets.forEach((asset) => {
    if (asset.included && asset.url) {
      imageMap.set(asset.nodeId, asset.url);
    }
  });

  function findNode(node, id) {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  const prefix = settings.namingMode === 'custom' ? settings.customPrefix : '';

  function buildHTML(node, depth = 0) {
    if (node.visible === false) return '';

    const className = nodeToClassName(node, prefix);
    const indent = '  '.repeat(depth);
    const hasImage = imageMap.has(node.id);

    if (node.type === 'TEXT') {
      const text = node.characters || node.name || '';
      return `${indent}<p class="${className}">${text}</p>\n`;
    }

    // Leaf node with image → render as div (background-image handled by CSS)
    // If user prefers <img> tag for accessibility, we add one inside
    if (hasImage && (!node.children || node.children.length === 0)) {
      const imgUrl = imageMap.get(node.id);
      return `${indent}<div class="${className}">\n${indent}  <img src="${imgUrl}" alt="${node.name}" style="width:100%;height:100%;object-fit:cover;display:block;" />\n${indent}</div>\n`;
    }

    if (!node.children || node.children.length === 0) {
      return `${indent}<div class="${className}"></div>\n`;
    }

    let html = `${indent}<div class="${className}">\n`;
    node.children.forEach((child) => {
      if (child.visible === false) return;
      html += buildHTML(child, depth + 1);
    });
    html += `${indent}</div>\n`;
    return html;
  }

  let bodyHTML = '';
  selectedNodeIds.forEach((sel) => {
    const node = findNode(fileData.document, sel.id);
    if (node) bodyHTML += buildHTML(node);
  });

  return bodyHTML;
}
