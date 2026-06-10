/**
 * Figma Node → CSS/HTML Generator
 *
 * Converts Figma node trees into CSS and HTML that replicate the design.
 *
 * Key positioning rules:
 * 1. ALWAYS check layoutMode first. If present and not 'NONE', use flexbox.
 * 2. Auto-layout frames → display:flex with direction, gap, padding, alignment
 * 3. Children of auto-layout → flex items (width/height from bbox, flex-grow, align-self)
 * 4. ONLY use position:absolute for children of NON-auto-layout parents
 * 5. For absolute children: top/left = child.absoluteBoundingBox - parent.absoluteBoundingBox
 * 6. Constraints (LEFT, RIGHT, CENTER, LEFT_RIGHT, TOP, BOTTOM, TOP_BOTTOM, SCALE)
 *
 * CSS and HTML share the same nodeToClassName() function so selectors always match.
 */

// ─── NAMING (DETERMINISTIC) ───────────────────────────────────────────────

function sanitize(str) {
  return str
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/^(\d)/, '_$1') || 'layer';
}

export function nodeToClassName(node, prefix = '') {
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

// ─── ASPECT RATIO ──────────────────────────────────────────────────────────

function computeAspectRatio(w, h) {
  if (!w || !h || w <= 0 || h <= 0) return null;
  // Check for clean ratios up to 20
  for (let denom = 1; denom <= 20; denom++) {
    const numer = (w / h) * denom;
    if (Math.abs(numer - Math.round(numer)) < 0.01) {
      return `${Math.round(numer)} / ${denom}`;
    }
  }
  return null;
}

// ─── CONSTRAINT-BASED POSITIONING ──────────────────────────────────────────

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
      props['left'] = '50%';
      props['transform'] = `translateX(-50%)`;
      props['width'] = `${nodeW}px`;
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
      props['top'] = '50%';
      // Combine with horizontal center transform if present
      if (props['transform'] && props['transform'].includes('translateX')) {
        props['transform'] = 'translate(-50%, -50%)';
      } else {
        props['transform'] = 'translateY(-50%)';
      }
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

// ─── IMAGE FILL HELPER ─────────────────────────────────────────────────────

function applyImageBackground(props, url, node) {
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

  // Image takes priority over solid fills
  delete props['background-color'];
  delete props['background'];
}

// ─── CSS GENERATION FOR A SINGLE NODE ──────────────────────────────────────

function generateNodeCSS(node, settings, context, imageMap) {
  const { parentNode, parentBBox, isRootSelected } = context;
  const props = {};
  const bbox = node.absoluteBoundingBox;
  const parentIsAutoLayout = hasAutoLayout(parentNode);

  // ═══ POSITIONING & DIMENSIONS ═══

  if (isRootSelected) {
    // Root selected node: explicit size
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
    const parentDir = parentNode.layoutMode;

    if (settings.includeDimensions && bbox) {
      const w = Math.round(bbox.width);
      const h = Math.round(bbox.height);

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
        // VERTICAL
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

      // Ensure both dimensions are set for non-growing, non-stretching items
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

  // ═══ FLEX LAYOUT (if this node IS an auto-layout container) ═══

  if (hasAutoLayout(node)) {
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
  } else if (node.children && node.children.length > 0) {
    // Non-auto-layout frame with children → positioning context
    if (!props['position']) {
      props['position'] = 'relative';
    }
  }

  // ═══ ASPECT RATIO ═══

  if (bbox && settings.includeDimensions) {
    const ratio = computeAspectRatio(Math.round(bbox.width), Math.round(bbox.height));
    if (ratio) {
      props['aspect-ratio'] = ratio;
    }
  }

  // ═══ BACKGROUND ═══

  if (node.fills && node.fills.length > 0) {
    const visibleFills = node.fills.filter((f) => f.visible !== false);
    if (visibleFills.length > 0) {
      // Check for IMAGE fills with imageMap entry
      const hasImageFill = visibleFills.some((f) => f.type === 'IMAGE');
      if (hasImageFill && imageMap && imageMap.has(node.id)) {
        applyImageBackground(props, imageMap.get(node.id), node);
      } else {
        const bgValues = visibleFills
          .filter((f) => f.type !== 'IMAGE')
          .map(paintToBackground)
          .filter(Boolean);
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

  if (node.type === 'STAR') {
    const pointCount = node.pointCount || 5;
    const innerRadius = node.innerRadius || 0.382;
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

  if (node.type === 'LINE') {
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

  // ═══ ROTATION ═══

  if (node.rotation && node.rotation !== 0) {
    const rotateValue = `rotate(${(-node.rotation).toFixed(1)}deg)`;
    // Merge with existing transform (from constraints CENTER)
    if (props['transform'] && !props['transform'].includes('rotate')) {
      props['transform'] += ` ${rotateValue}`;
    } else if (!props['transform']) {
      props['transform'] = rotateValue;
    }
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
  const cssProps = generateNodeCSS(node, settings, context, imageMap);

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

// ─── FORMAT CSS OUTPUT ─────────────────────────────────────────────────────

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

// ─── TREE SEARCH ───────────────────────────────────────────────────────────

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

// ─── PUBLIC API ────────────────────────────────────────────────────────────

/**
 * Generate CSS for selected Figma nodes.
 *
 * 1. Builds imageMap from imageAssets
 * 2. Finds selected nodes in document tree
 * 3. For each, calls generateRecursive to walk the tree
 * 4. Outputs CSS with optional :root variables block
 */
export function generateCSS(fileData, selectedNodeIds, settings, imageAssets = []) {
  const allRules = [];

  // Build imageMap: nodeId → imageUrl
  const imageMap = new Map();
  imageAssets.forEach((asset) => {
    if (asset.included && asset.url) {
      imageMap.set(asset.nodeId, asset.url);
    }
  });

  // Find selected nodes in document tree
  const selectedNodes = selectedNodeIds
    .map((sel) => findNode(fileData.document, sel.id))
    .filter(Boolean);

  // Extract variables if enabled
  let variables = { colors: new Map(), fonts: new Set() };
  if (settings.includeVariables) {
    variables = extractVariables(selectedNodes);
  }

  // Generate CSS rules for each selected node tree
  selectedNodes.forEach((node) => {
    const rules = generateRecursive(node, settings, '', null, null, true, imageMap);
    allRules.push(...rules);
  });

  // Build output
  let output = '';

  // Optional :root variables block
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
 *
 * 1. Uses same nodeToClassName for class names (ensures CSS/HTML match)
 * 2. Outputs nested divs matching the Figma layer tree
 * 3. TEXT nodes become <p> tags with their characters content
 * 4. Image nodes get <img> tags when they have imageMap entries
 */
export function generateHTML(fileData, selectedNodeIds, settings, imageAssets = []) {
  // Build image map
  const imageMap = new Map();
  imageAssets.forEach((asset) => {
    if (asset.included && asset.url) {
      imageMap.set(asset.nodeId, asset.url);
    }
  });

  const prefix = settings.namingMode === 'custom' ? settings.customPrefix : '';

  function buildHTML(node, depth = 0) {
    if (node.visible === false) return '';

    const className = nodeToClassName(node, prefix);
    const indent = '  '.repeat(depth);
    const hasImage = imageMap.has(node.id);

    // TEXT nodes → <p> tags
    if (node.type === 'TEXT') {
      const text = node.characters || node.name || '';
      return `${indent}<p class="${className}">${text}</p>\n`;
    }

    // Leaf node with image → <img> tag inside div
    if (hasImage && (!node.children || node.children.length === 0)) {
      const imgUrl = imageMap.get(node.id);
      return `${indent}<div class="${className}">\n${indent}  <img src="${imgUrl}" alt="${node.name}" />\n${indent}</div>\n`;
    }

    // Leaf node without children
    if (!node.children || node.children.length === 0) {
      return `${indent}<div class="${className}"></div>\n`;
    }

    // Container with children
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
