import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { generateCSS, generateHTML } from '../lib/cssGenerator';
import { fetchFigmaImages } from '../lib/figmaApi';
import '../styles/CSSOutput.css';

const DEVICES = {
  desktop: { label: 'Desktop', width: 1440, height: 900, icon: '🖥️' },
  tablet: { label: 'Tablet', width: 768, height: 1024, icon: '📱' },
  phone: { label: 'Phone', width: 375, height: 812, icon: '📲' },
  phoneLandscape: { label: 'Phone ↔', width: 812, height: 375, icon: '📲' },
};

const BACKGROUNDS = [
  { label: 'Dark', value: '#1a1a1f' },
  { label: 'Light', value: '#ffffff' },
  { label: 'Gray', value: '#f3f4f6' },
  { label: 'Checker', value: 'checker' },
];

export default function CSSOutput({ fileData, selectedNodes, settings, imageAssets, fontAssets, generatedCSS, setGeneratedCSS, token, fileKey, onBack }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [device, setDevice] = useState('desktop');
  const [bgOption, setBgOption] = useState(BACKGROUNDS[1]); // default white
  const [zoom, setZoom] = useState(null);
  const [activeFrame, setActiveFrame] = useState(0); // which selected node to preview
  const [compareMode, setCompareMode] = useState('side');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [figmaImageUrl, setFigmaImageUrl] = useState(null);
  const [figmaImageLoading, setFigmaImageLoading] = useState(false);
  const figmaImageCache = useRef({}); // cache: nodeId → imageUrl

  const previewIframeRef = useRef(null);
  const compareIframeRef = useRef(null);
  const stageRef = useRef(null);

  // Font handling
  const usedFonts = useMemo(() => {
    if (!fontAssets || fontAssets.length === 0) return [];
    return fontAssets.filter((f) => f.included).map((f) => f.family);
  }, [fontAssets]);

  const googleFontsUrl = useMemo(() => {
    if (!fontAssets || fontAssets.length === 0) return '';
    const googleFonts = fontAssets.filter((f) => f.included && f.isGoogleFont);
    if (googleFonts.length === 0) return '';
    const families = googleFonts
      .map((f) => `family=${encodeURIComponent(f.family)}:wght@${f.weights ? f.weights.join(';') : '400;500;600;700'}`)
      .join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }, [fontAssets]);

  // Get bounds for the currently active frame
  const activeNode = useMemo(() => {
    if (!fileData || selectedNodes.length === 0) return null;
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
    const sel = selectedNodes[activeFrame] || selectedNodes[0];
    return sel ? findNode(fileData.document, sel.id) : null;
  }, [fileData, selectedNodes, activeFrame]);

  const designBounds = useMemo(() => {
    if (!activeNode?.absoluteBoundingBox) return { width: 800, height: 600 };
    return {
      width: activeNode.absoluteBoundingBox.width,
      height: activeNode.absoluteBoundingBox.height,
    };
  }, [activeNode]);

  // Auto-fit zoom
  const calculateFitZoom = useCallback(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return 50;
    const containerW = stageEl.clientWidth - 48;
    const containerH = stageEl.clientHeight - 48;
    const currentDevice = DEVICES[device];
    let contentW = device === 'desktop' ? designBounds.width : currentDevice.width;
    let contentH = device === 'desktop' ? designBounds.height : currentDevice.height;
    if (activeTab === 'compare' && compareMode === 'side') contentW = contentW * 2 + 32;
    const scaleX = containerW / (contentW + 40);
    const scaleY = containerH / (contentH + 40);
    return Math.max(10, Math.min(Math.round(Math.min(scaleX, scaleY, 1) * 100), 100));
  }, [device, designBounds, activeTab, compareMode]);

  useEffect(() => {
    if (activeTab === 'preview' || activeTab === 'compare') {
      const t = setTimeout(() => setZoom(calculateFitZoom()), 60);
      return () => clearTimeout(t);
    }
  }, [activeTab, device, compareMode, activeFrame, calculateFitZoom]);

  useEffect(() => {
    if (activeTab !== 'preview' && activeTab !== 'compare') return;
    const h = () => setZoom(calculateFitZoom());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [activeTab, calculateFitZoom]);

  // Generate CSS (for ALL selected nodes)
  useEffect(() => {
    if (fileData && selectedNodes.length > 0) {
      const css = generateCSS(fileData, selectedNodes, settings, imageAssets || []);
      setGeneratedCSS(css);
    }
  }, [fileData, selectedNodes, settings, imageAssets, setGeneratedCSS]);

  // Generate preview HTML for the ACTIVE FRAME only
  const previewHTML = useMemo(() => {
    if (!fileData || !generatedCSS || !activeNode) return '';
    const singleNode = [selectedNodes[activeFrame] || selectedNodes[0]];
    const bodyHTML = generateHTML(fileData, singleNode, settings, imageAssets || []);
    const singleCSS = generateCSS(fileData, singleNode, settings, imageAssets || []);

    const bgCSS = bgOption.value === 'checker'
      ? `background-color: #fff; background-image: linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;`
      : `background-color: ${bgOption.value};`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  ${googleFontsUrl ? `<link href="${googleFontsUrl}" rel="stylesheet" />` : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { margin: 0; padding: 0; ${bgCSS} }
    body { overflow: hidden; }
    p { margin: 0; }
    img { display: block; max-width: none; }
    ${singleCSS}
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
  }, [fileData, selectedNodes, activeFrame, activeNode, settings, imageAssets, generatedCSS, bgOption, googleFontsUrl]);

  // Write to iframes
  useEffect(() => {
    if (activeTab === 'preview' && previewIframeRef.current && previewHTML) {
      previewIframeRef.current.srcdoc = previewHTML;
    }
  }, [activeTab, previewHTML]);

  useEffect(() => {
    if (activeTab === 'compare' && compareIframeRef.current && previewHTML) {
      compareIframeRef.current.srcdoc = previewHTML;
    }
  }, [activeTab, compareMode, previewHTML]);

  // Fetch Figma render for compare (with caching)
  const fetchFigmaImage = useCallback(async () => {
    if (!token || !fileKey || !selectedNodes[activeFrame]) { setFigmaImageUrl(null); return; }
    const nodeId = selectedNodes[activeFrame].id;

    // Return cached image if available
    if (figmaImageCache.current[nodeId]) {
      setFigmaImageUrl(figmaImageCache.current[nodeId]);
      return;
    }

    setFigmaImageLoading(true);
    try {
      const data = await fetchFigmaImages(fileKey, token, [nodeId], 'png', '2');
      const url = data.images?.[nodeId] || null;
      if (url) figmaImageCache.current[nodeId] = url;
      setFigmaImageUrl(url);
    } catch { setFigmaImageUrl(null); }
    finally { setFigmaImageLoading(false); }
  }, [token, fileKey, selectedNodes, activeFrame]);

  useEffect(() => {
    if (activeTab === 'compare') { setFigmaImageUrl(null); fetchFigmaImage(); }
  }, [activeTab, activeFrame]);

  // Actions
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(generatedCSS); }
    catch { /* fallback */ const t = document.createElement('textarea'); t.value = generatedCSS; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([generatedCSS], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'figma-styles.css';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const lineCount = generatedCSS ? generatedCSS.split('\n').length : 0;
  const effectiveZoom = zoom ?? 50;
  const iframeW = device === 'desktop' ? Math.round(designBounds.width) : DEVICES[device].width;
  const iframeH = device === 'desktop' ? Math.round(designBounds.height) : DEVICES[device].height;

  return (
    <div className="css-output panel">
      <div className="output-header">
        <div>
          <h2 className="panel-title">Generated CSS</h2>
          <p className="panel-subtitle">
            {lineCount} lines • {selectedNodes.length} frame{selectedNodes.length !== 1 ? 's' : ''}
            {designBounds.width > 0 && ` • ${Math.round(designBounds.width)}×${Math.round(designBounds.height)}px`}
          </p>
        </div>
        <div className="output-actions">
          <button className="btn btn-secondary" onClick={handleCopy}>{copied ? '✓ Copied' : '📋 Copy'}</button>
          <button className="btn btn-primary" onClick={handleDownload}>⬇ Download CSS</button>
        </div>
      </div>

      {/* Frame selector — shows when multiple frames are selected */}
      {selectedNodes.length > 1 && (activeTab === 'preview' || activeTab === 'compare') && (
        <div className="frame-selector">
          {selectedNodes.map((node, i) => (
            <button
              key={node.id}
              className={`frame-tab ${i === activeFrame ? 'active' : ''}`}
              onClick={() => setActiveFrame(i)}
            >
              {node.name}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="output-tabs-row">
        <div className="output-tabs">
          <button className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`} onClick={() => setActiveTab('code')}>{'</>'} Code</button>
          <button className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>👁 Preview</button>
          <button className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`} onClick={() => setActiveTab('compare')}>⚖ Compare</button>
        </div>

        {(activeTab === 'preview' || activeTab === 'compare') && (
          <div className="preview-toolbar">
            <div className="device-switcher">
              {Object.entries(DEVICES).map(([key, dev]) => (
                <button key={key} className={`device-btn ${device === key ? 'active' : ''}`} onClick={() => setDevice(key)} title={dev.label}>
                  <span className="device-icon">{dev.icon}</span><span className="device-label">{dev.label}</span>
                </button>
              ))}
            </div>
            <div className="toolbar-divider" />
            <div className="bg-switcher">
              {BACKGROUNDS.map((bg) => (
                <button key={bg.label} className={`bg-btn ${bgOption.label === bg.label ? 'active' : ''}`} onClick={() => setBgOption(bg)} title={bg.label}>
                  <span className="bg-swatch" style={{ background: bg.value === 'checker' ? 'repeating-conic-gradient(#808080 0% 25%, #b0b0b0 0% 50%) 50%/8px 8px' : bg.value }} />
                </button>
              ))}
            </div>
            <div className="toolbar-divider" />
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={() => setZoom(z => Math.max(10, (z??50)-10))}>−</button>
              <span className="zoom-value">{effectiveZoom}%</span>
              <button className="zoom-btn" onClick={() => setZoom(z => Math.min(300, (z??50)+10))}>+</button>
              <button className="zoom-btn zoom-fit" onClick={() => setZoom(calculateFitZoom())} title="Fit">⊡</button>
            </div>
            {activeTab === 'compare' && (
              <>
                <div className="toolbar-divider" />
                <div className="compare-controls">
                  <button className={`device-btn ${compareMode === 'side' ? 'active' : ''}`} onClick={() => setCompareMode('side')}>Side by Side</button>
                  <button className={`device-btn ${compareMode === 'overlay' ? 'active' : ''}`} onClick={() => setCompareMode('overlay')}>Overlay</button>
                </div>
                {compareMode === 'overlay' && (
                  <div className="overlay-slider">
                    <span className="overlay-label">Figma</span>
                    <input type="range" min="0" max="100" value={overlayOpacity} onChange={e => setOverlayOpacity(+e.target.value)} className="opacity-range" />
                    <span className="overlay-value">{overlayOpacity}%</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="output-content">
        {activeTab === 'code' && (
          <div className="code-container">
            <div className="code-line-numbers" aria-hidden="true">
              {generatedCSS && generatedCSS.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}
            </div>
            <pre className="css-code"><code>{generatedCSS || '/* No CSS generated */'}</code></pre>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="preview-stage" ref={stageRef}>
            <div className="preview-canvas" style={{ zoom: effectiveZoom / 100 }}>
              <iframe
                ref={previewIframeRef}
                className="preview-iframe preview-iframe--desktop"
                title="CSS Preview"
                sandbox="allow-same-origin"
                style={{ width: `${iframeW}px`, height: `${iframeH}px` }}
              />
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="preview-stage" ref={stageRef}>
            <div className="compare-wrapper" style={{ zoom: effectiveZoom / 100 }}>
              {compareMode === 'side' && (
                <div className="compare-side-by-side">
                  <div className="compare-panel">
                    <div className="compare-panel-label">CSS Output</div>
                    <iframe ref={compareIframeRef} className="preview-iframe compare-iframe" title="CSS" sandbox="allow-same-origin" style={{ width: `${iframeW}px`, height: `${iframeH}px` }} />
                  </div>
                  <div className="compare-panel">
                    <div className="compare-panel-label">Figma Design</div>
                    {figmaImageLoading && <div className="compare-placeholder" style={{ width: iframeW, height: iframeH }}><div className="placeholder-content"><span className="spinner"></span><p>Loading…</p></div></div>}
                    {!figmaImageLoading && figmaImageUrl && <img src={figmaImageUrl} alt="Figma" className="compare-figma-img" style={{ width: iframeW, height: iframeH }} />}
                    {!figmaImageLoading && !figmaImageUrl && <div className="compare-placeholder" style={{ width: iframeW, height: iframeH }}><div className="placeholder-content"><span className="placeholder-icon">🎨</span><p>Unavailable</p></div></div>}
                  </div>
                </div>
              )}
              {compareMode === 'overlay' && (
                <div className="compare-overlay" style={{ width: iframeW, height: iframeH }}>
                  <iframe ref={compareIframeRef} className="preview-iframe compare-iframe overlay-base" title="CSS" sandbox="allow-same-origin" style={{ width: iframeW, height: iframeH }} />
                  {figmaImageUrl && <img src={figmaImageUrl} alt="Figma" className="compare-figma-img overlay-top" style={{ width: iframeW, height: iframeH, opacity: overlayOpacity/100 }} />}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}
