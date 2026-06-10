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
  const [activeTab, setActiveTab] = useState('code');
  const [device, setDevice] = useState('desktop');
  const [bgOption, setBgOption] = useState(BACKGROUNDS[0]);
  const [zoom, setZoom] = useState(null);
  const [compareMode, setCompareMode] = useState('side');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [figmaImageUrl, setFigmaImageUrl] = useState(null);
  const [figmaImageLoading, setFigmaImageLoading] = useState(false);

  // Separate refs for preview and compare iframes
  const previewIframeRef = useRef(null);
  const compareIframeRef = useRef(null);
  const stageRef = useRef(null);

  // Use fontAssets from the asset selection step
  const usedFonts = useMemo(() => {
    if (!fontAssets || fontAssets.length === 0) return [];
    return fontAssets.filter((f) => f.included).map((f) => f.family);
  }, [fontAssets]);

  // Build Google Fonts URL for included fonts
  const googleFontsUrl = useMemo(() => {
    if (!fontAssets || fontAssets.length === 0) return '';
    const googleFonts = fontAssets.filter((f) => f.included && f.isGoogleFont);
    if (googleFonts.length === 0) return '';
    const families = googleFonts
      .map((f) => {
        const weights = f.weights ? f.weights.join(';') : '100;200;300;400;500;600;700;800;900';
        return `family=${encodeURIComponent(f.family)}:wght@${weights}`;
      })
      .join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }, [fontAssets]);

  // Design bounds for auto-fit
  const designBounds = useMemo(() => {
    if (!fileData || selectedNodes.length === 0) return { width: 800, height: 600 };
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
    let maxW = 0, maxH = 0;
    selectedNodes.forEach((sel) => {
      const node = findNode(fileData.document, sel.id);
      if (node?.absoluteBoundingBox) {
        maxW = Math.max(maxW, node.absoluteBoundingBox.width);
        maxH = Math.max(maxH, node.absoluteBoundingBox.height);
      }
    });
    return { width: maxW || 800, height: maxH || 600 };
  }, [fileData, selectedNodes]);

  // Calculate auto-fit zoom
  const calculateFitZoom = useCallback(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return 60;

    const containerW = stageEl.clientWidth - 64;
    const containerH = stageEl.clientHeight - 64;

    const currentDevice = DEVICES[device];
    let contentW = device === 'desktop' ? designBounds.width : currentDevice.width;
    let contentH = device === 'desktop' ? designBounds.height : currentDevice.height;

    // In side-by-side compare, content is doubled + gap
    if (activeTab === 'compare' && compareMode === 'side') {
      contentW = contentW * 2 + 40;
    }

    const frameExtra = device !== 'desktop' ? 50 : 0;
    const totalW = contentW + frameExtra;
    const totalH = contentH + frameExtra;

    const scaleX = containerW / totalW;
    const scaleY = containerH / totalH;
    return Math.max(10, Math.min(Math.round(Math.min(scaleX, scaleY, 1) * 100), 100));
  }, [device, designBounds, activeTab, compareMode]);

  // Auto-fit on tab/device change
  useEffect(() => {
    if (activeTab === 'preview' || activeTab === 'compare') {
      const timer = setTimeout(() => setZoom(calculateFitZoom()), 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, device, compareMode, calculateFitZoom]);

  // Recalculate on resize
  useEffect(() => {
    if (activeTab !== 'preview' && activeTab !== 'compare') return;
    const handleResize = () => setZoom(calculateFitZoom());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab, calculateFitZoom]);

  // Generate CSS
  useEffect(() => {
    if (fileData && selectedNodes.length > 0) {
      const css = generateCSS(fileData, selectedNodes, settings, imageAssets || []);
      setGeneratedCSS(css);
    }
  }, [fileData, selectedNodes, settings, imageAssets, setGeneratedCSS]);

  // Generate the preview HTML string
  const previewHTML = useMemo(() => {
    if (!fileData || !generatedCSS) return '';
    const bodyHTML = generateHTML(fileData, selectedNodes, settings, imageAssets || []);

    const bgCSS = bgOption.value === 'checker'
      ? `background-color: #1a1a1f; background-image: linear-gradient(45deg, #2a2a2f 25%, transparent 25%), linear-gradient(-45deg, #2a2a2f 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2f 75%), linear-gradient(-45deg, transparent 75%, #2a2a2f 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;`
      : `background-color: ${bgOption.value};`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  ${googleFontsUrl ? `<link href="${googleFontsUrl}" rel="stylesheet" />` : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html {
      ${bgCSS}
    }
    body {
      width: ${Math.round(designBounds.width)}px;
      min-height: ${Math.round(designBounds.height)}px;
      overflow: auto;
      margin: 0;
      font-family: ${usedFonts.length > 0 ? `'${usedFonts[0]}', ` : ''}sans-serif;
    }
    p { margin: 0; }
    img { display: block; }
    ${generatedCSS}
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
  }, [fileData, selectedNodes, settings, imageAssets, generatedCSS, bgOption, designBounds, googleFontsUrl, usedFonts]);

  // Write srcdoc to preview iframe
  useEffect(() => {
    if (activeTab === 'preview' && previewIframeRef.current && previewHTML) {
      previewIframeRef.current.srcdoc = previewHTML;
    }
  }, [activeTab, previewHTML]);

  // Write srcdoc to compare iframe (separate effect, separate ref)
  useEffect(() => {
    if (activeTab === 'compare' && compareIframeRef.current && previewHTML) {
      compareIframeRef.current.srcdoc = previewHTML;
    }
  }, [activeTab, compareMode, previewHTML]);

  // Fetch Figma rendered image for comparison
  const fetchFigmaImage = useCallback(async () => {
    if (!fileData || selectedNodes.length === 0 || !token || !fileKey) {
      setFigmaImageUrl(null);
      return;
    }
    setFigmaImageLoading(true);
    try {
      const nodeIds = selectedNodes.map((n) => n.id);
      const data = await fetchFigmaImages(fileKey, token, nodeIds, 'png', '2');
      if (data.images) {
        const firstImage = Object.values(data.images).find(Boolean);
        setFigmaImageUrl(firstImage || null);
      } else {
        setFigmaImageUrl(null);
      }
    } catch {
      setFigmaImageUrl(null);
    } finally {
      setFigmaImageLoading(false);
    }
  }, [fileData, selectedNodes, token, fileKey]);

  useEffect(() => {
    if (activeTab === 'compare' && !figmaImageUrl && !figmaImageLoading) {
      fetchFigmaImage();
    }
  }, [activeTab]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCSS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = generatedCSS;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedCSS], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'figma-styles.css';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lineCount = generatedCSS ? generatedCSS.split('\n').length : 0;
  const currentDevice = DEVICES[device];
  const effectiveZoom = zoom ?? 60;
  const iframeW = device === 'desktop' ? Math.round(designBounds.width) : currentDevice.width;
  const iframeH = device === 'desktop' ? Math.round(designBounds.height) : currentDevice.height;

  return (
    <div className="css-output panel">
      <div className="output-header">
        <div>
          <h2 className="panel-title">Generated CSS</h2>
          <p className="panel-subtitle">
            {lineCount} lines • {selectedNodes.length} element{selectedNodes.length !== 1 ? 's' : ''} converted
            {designBounds.width > 0 && (
              <span className="design-size"> • {Math.round(designBounds.width)}×{Math.round(designBounds.height)}px</span>
            )}
            {usedFonts.length > 0 && (
              <span className="design-size"> • {usedFonts.length} font{usedFonts.length !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        <div className="output-actions">
          <button className="btn btn-secondary" onClick={handleCopy}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          <button className="btn btn-primary" onClick={handleDownload}>
            ⬇ Download CSS
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="output-tabs-row">
        <div className="output-tabs">
          <button className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`} onClick={() => setActiveTab('code')}>
            <span className="tab-icon">{'</>'}</span> Code
          </button>
          <button className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>
            <span className="tab-icon">👁</span> Preview
          </button>
          <button className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`} onClick={() => setActiveTab('compare')}>
            <span className="tab-icon">⚖</span> Compare
          </button>
        </div>

        {(activeTab === 'preview' || activeTab === 'compare') && (
          <div className="preview-toolbar">
            <div className="device-switcher">
              {Object.entries(DEVICES).map(([key, dev]) => (
                <button
                  key={key}
                  className={`device-btn ${device === key ? 'active' : ''}`}
                  onClick={() => setDevice(key)}
                  title={dev.label}
                >
                  <span className="device-icon">{dev.icon}</span>
                  <span className="device-label">{dev.label}</span>
                </button>
              ))}
            </div>

            <div className="toolbar-divider" />

            <div className="bg-switcher">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg.label}
                  className={`bg-btn ${bgOption.label === bg.label ? 'active' : ''}`}
                  onClick={() => setBgOption(bg)}
                  title={`${bg.label} background`}
                >
                  <span className="bg-swatch" style={{
                    background: bg.value === 'checker'
                      ? 'repeating-conic-gradient(#808080 0% 25%, #b0b0b0 0% 50%) 50%/8px 8px'
                      : bg.value,
                  }} />
                </button>
              ))}
            </div>

            <div className="toolbar-divider" />

            <div className="zoom-controls">
              <button className="zoom-btn" onClick={() => setZoom((z) => Math.max(10, (z ?? 60) - 10))}>−</button>
              <span className="zoom-value">{effectiveZoom}%</span>
              <button className="zoom-btn" onClick={() => setZoom((z) => Math.min(200, (z ?? 60) + 10))}>+</button>
              <button className="zoom-btn zoom-fit" onClick={() => setZoom(calculateFitZoom())} title="Fit to view">⊡</button>
            </div>

            {activeTab === 'compare' && (
              <>
                <div className="toolbar-divider" />
                <div className="compare-controls">
                  <button className={`device-btn ${compareMode === 'side' ? 'active' : ''}`} onClick={() => setCompareMode('side')}>
                    Side by Side
                  </button>
                  <button className={`device-btn ${compareMode === 'overlay' ? 'active' : ''}`} onClick={() => setCompareMode('overlay')}>
                    Overlay
                  </button>
                </div>
                {compareMode === 'overlay' && (
                  <div className="overlay-slider">
                    <span className="overlay-label">Figma</span>
                    <input
                      type="range" min="0" max="100"
                      value={overlayOpacity}
                      onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                      className="opacity-range"
                    />
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
              {generatedCSS && generatedCSS.split('\n').map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <pre className="css-code"><code>{generatedCSS || '/* No CSS generated */'}</code></pre>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="preview-stage" ref={stageRef}>
            <div
              className="preview-canvas"
              style={{ zoom: effectiveZoom / 100 }}
            >
              {device !== 'desktop' ? (
                <div className={`device-frame device-frame--${device}`}>
                  <div className="device-frame__header"><div className="device-frame__notch" /></div>
                  <div className="device-frame__screen">
                    <iframe
                      ref={previewIframeRef}
                      className="preview-iframe"
                      title="CSS Preview"
                      sandbox="allow-same-origin"
                      style={{ width: `${iframeW}px`, height: `${iframeH}px` }}
                    />
                  </div>
                </div>
              ) : (
                <iframe
                  ref={previewIframeRef}
                  className="preview-iframe preview-iframe--desktop"
                  title="CSS Preview"
                  sandbox="allow-same-origin"
                  style={{ width: `${iframeW}px`, height: `${iframeH}px` }}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="preview-stage" ref={stageRef}>
            <div
              className="compare-wrapper"
              style={{ zoom: effectiveZoom / 100 }}
            >
              {compareMode === 'side' && (
                <div className="compare-side-by-side">
                  <div className="compare-panel">
                    <div className="compare-panel-label">CSS Output</div>
                    <iframe
                      ref={compareIframeRef}
                      className="preview-iframe compare-iframe"
                      title="CSS Preview"
                      sandbox="allow-same-origin"
                      style={{ width: `${iframeW}px`, height: `${iframeH}px` }}
                    />
                  </div>
                  <div className="compare-panel">
                    <div className="compare-panel-label">Figma Design</div>
                    {figmaImageLoading && (
                      <div className="compare-placeholder" style={{ width: `${iframeW}px`, height: `${iframeH}px` }}>
                        <div className="placeholder-content"><span className="spinner"></span><p>Loading Figma render…</p></div>
                      </div>
                    )}
                    {!figmaImageLoading && figmaImageUrl && (
                      <img src={figmaImageUrl} alt="Figma render" className="compare-figma-img" style={{ width: `${iframeW}px`, height: `${iframeH}px` }} />
                    )}
                    {!figmaImageLoading && !figmaImageUrl && (
                      <div className="compare-placeholder" style={{ width: `${iframeW}px`, height: `${iframeH}px` }}>
                        <div className="placeholder-content">
                          <span className="placeholder-icon">🎨</span>
                          <p>Figma render unavailable</p>
                          <p className="placeholder-hint">Ensure your token has image export access.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {compareMode === 'overlay' && (
                <div className="compare-overlay" style={{ width: `${iframeW}px`, height: `${iframeH}px` }}>
                  <iframe
                    ref={compareIframeRef}
                    className="preview-iframe compare-iframe overlay-base"
                    title="CSS Preview"
                    sandbox="allow-same-origin"
                    style={{ width: `${iframeW}px`, height: `${iframeH}px` }}
                  />
                  {figmaImageUrl && (
                    <img
                      src={figmaImageUrl}
                      alt="Figma overlay"
                      className="compare-figma-img overlay-top"
                      style={{ width: `${iframeW}px`, height: `${iframeH}px`, opacity: overlayOpacity / 100 }}
                    />
                  )}
                  {!figmaImageUrl && (
                    <div className="overlay-notice">Figma render unavailable for overlay</div>
                  )}
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
