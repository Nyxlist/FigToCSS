import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { generateCSS, generateHTML } from '../lib/generator';
import { getNodeIndex } from '../lib/nodeIndex';
import { collectSvgNodes, exportAssetNames, makeAssetResolvers } from '../lib/assets';
import { googleFontsUrl } from '../lib/fonts';
import { buildZip } from '../lib/zipExport';
import { sanitize } from '../lib/generator/naming';
import PreviewToolbar, { DEVICES, BACKGROUNDS } from './PreviewToolbar';
import ComparePane from './ComparePane';
import CodeView from './CodeView';
import '../styles/CSSOutput.css';

const CHECKER_BG = 'background-color: #fff; background-image: linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px;';

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CSSOutput({ fileData, selectedNodes, settings, source, imageAssets, fontAssets, fillUrls, onBack }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [device, setDevice] = useState('desktop');
  const [bgOption, setBgOption] = useState(BACKGROUNDS[1]); // default white
  const [zoom, setZoom] = useState(null);
  const [activeFrame, setActiveFrame] = useState(0); // which selected node to preview
  const [compareMode, setCompareMode] = useState('side');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [zipState, setZipState] = useState({ busy: false, message: '', warning: false });

  const previewIframeRef = useRef(null);
  const stageRef = useRef(null);

  const fontsUrl = useMemo(() => googleFontsUrl(fontAssets), [fontAssets]);
  const activeSel = selectedNodes[activeFrame] || selectedNodes[0];
  const activeNode = activeSel ? getNodeIndex(fileData.document).get(activeSel.id) : null;

  const designBounds = useMemo(() => {
    if (!activeNode?.absoluteBoundingBox) return { width: 800, height: 600 };
    return {
      width: activeNode.absoluteBoundingBox.width,
      height: activeNode.absoluteBoundingBox.height,
    };
  }, [activeNode]);

  // ─── Generation ───
  const svgNodes = useMemo(
    () => collectSvgNodes(fileData.document, selectedNodes, source),
    [fileData, selectedNodes, source]
  );
  const exportResolvers = useMemo(() => {
    const names = exportAssetNames(fileData.document, selectedNodes, source, imageAssets);
    return makeAssetResolvers({ source, imageAssets, fillUrls, mode: 'export', names });
  }, [fileData, selectedNodes, source, imageAssets, fillUrls]);
  const previewResolvers = useMemo(
    () => makeAssetResolvers({ source, imageAssets, fillUrls, mode: 'preview' }),
    [source, imageAssets, fillUrls]
  );
  const hasImages = imageAssets.some((a) => a.included);
  const hasFileAssets = svgNodes.length > 0 || hasImages;
  let headerNote = '';
  if (hasFileAssets) {
    headerNote = 'Images live in an images/ folder next to this file (use "Download .zip" to get them).';
    if (source.kind === 'api' && hasImages) {
      headerNote += ' Image files are assumed to be .png here; the .zip uses the real file types.';
    }
  }

  const generatedCSS = useMemo(() => generateCSS(fileData, selectedNodes, settings, {
    ...exportResolvers,
    fileName: source.fileName,
    headerNote,
  }), [fileData, selectedNodes, settings, exportResolvers, source.fileName, headerNote]);

  const generatedHTML = useMemo(
    () => generateHTML(fileData, selectedNodes, settings, exportResolvers),
    [fileData, selectedNodes, settings, exportResolvers]
  );

  // Preview HTML for the ACTIVE FRAME only, with preview-mode URLs.
  const previewHTML = useMemo(() => {
    if (!activeSel) return '';
    const single = [activeSel];
    const options = { ...previewResolvers, fileName: source.fileName };
    const bodyHTML = generateHTML(fileData, single, settings, options);
    // Never let CSS text close the <style> element of the srcdoc.
    const singleCSS = generateCSS(fileData, single, settings, options).replace(/<\//g, '<\\/');
    const bgCSS = bgOption.value === 'checker' ? CHECKER_BG : `background-color: ${bgOption.value};`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  ${fontsUrl ? `<link href="${fontsUrl}" rel="stylesheet" />` : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { margin: 0; padding: 0; ${bgCSS} }
    body { overflow: hidden; }
    p { margin: 0; }
    ${singleCSS}
  </style>
</head>
<body>
${bodyHTML}
</body>
</html>`;
  }, [fileData, activeSel, settings, previewResolvers, source.fileName, bgOption, fontsUrl]);

  // ─── Zoom ───
  const calculateFitZoom = useCallback(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return 50;
    const containerW = stageEl.clientWidth - 48;
    const containerH = stageEl.clientHeight - 48;
    let contentW = device === 'desktop' ? designBounds.width : DEVICES[device].width;
    const contentH = device === 'desktop' ? designBounds.height : DEVICES[device].height;
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
    return undefined;
  }, [activeTab, device, compareMode, activeFrame, calculateFitZoom]);

  useEffect(() => {
    if (activeTab !== 'preview' && activeTab !== 'compare') return undefined;
    const h = () => setZoom(calculateFitZoom());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [activeTab, calculateFitZoom]);

  useEffect(() => {
    if (activeTab === 'preview' && previewIframeRef.current && previewHTML) {
      previewIframeRef.current.srcdoc = previewHTML;
    }
  }, [activeTab, previewHTML]);

  // ─── Actions ───
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCSS);
    } catch {
      const t = document.createElement('textarea');
      t.value = generatedCSS;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCSS = () => {
    downloadBlob(new Blob([generatedCSS], { type: 'text/css' }), 'figma-styles.css');
  };

  const handleDownloadZip = async () => {
    setZipState({ busy: true, message: 'Building .zip…', warning: false });
    try {
      const { blob, warnings } = await buildZip({
        fileData, selectedNodes, settings, source, imageAssets, fontAssets, fillUrls,
      });
      downloadBlob(blob, `${sanitize(source.fileName)}.zip`);
      setZipState({
        busy: false,
        warning: warnings.length > 0,
        message: warnings.length > 0
          ? `Downloaded with ${warnings.length} warning${warnings.length !== 1 ? 's' : ''} (see README.txt in the zip).`
          : '',
      });
    } catch (err) {
      setZipState({ busy: false, message: `Could not build the zip: ${err.message}`, warning: true });
    }
  };

  const lineCount = generatedCSS.split('\n').length;
  const effectiveZoom = zoom ?? 50;
  const iframeW = device === 'desktop' ? Math.round(designBounds.width) : DEVICES[device].width;
  const iframeH = device === 'desktop' ? Math.round(designBounds.height) : DEVICES[device].height;
  const showStage = activeTab === 'preview' || activeTab === 'compare';

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
          <button className="btn btn-secondary" onClick={handleCopy}>{copied ? '✓ Copied' : '📋 Copy CSS'}</button>
          <button className="btn btn-secondary" onClick={handleDownloadCSS}>⬇ Download CSS</button>
          <button className="btn btn-primary" onClick={handleDownloadZip} disabled={zipState.busy}>
            {zipState.busy ? 'Building…' : '⬇ Download .zip'}
          </button>
        </div>
      </div>

      {zipState.message && (
        <p className={`output-status ${zipState.warning ? 'warning' : ''}`}>{zipState.message}</p>
      )}

      {selectedNodes.length > 1 && showStage && (
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

      <div className="output-tabs-row">
        <div className="output-tabs">
          <button className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`} onClick={() => setActiveTab('code')}>{'</>'} Code</button>
          <button className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>👁 Preview</button>
          <button className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`} onClick={() => setActiveTab('compare')}>⚖ Compare</button>
        </div>

        {showStage && (
          <PreviewToolbar
            device={device}
            setDevice={setDevice}
            bgOption={bgOption}
            setBgOption={setBgOption}
            zoom={effectiveZoom}
            setZoom={setZoom}
            onFit={() => setZoom(calculateFitZoom())}
            showCompare={activeTab === 'compare'}
            compareMode={compareMode}
            setCompareMode={setCompareMode}
            overlayOpacity={overlayOpacity}
            setOverlayOpacity={setOverlayOpacity}
          />
        )}
      </div>

      <div className="output-content">
        {activeTab === 'code' && <CodeView css={generatedCSS} html={generatedHTML} />}

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

        {activeTab === 'compare' && activeSel && (
          <ComparePane
            source={source}
            nodeId={activeSel.id}
            previewHTML={previewHTML}
            width={iframeW}
            height={iframeH}
            mode={compareMode}
            overlayOpacity={overlayOpacity}
            zoom={effectiveZoom}
            stageRef={stageRef}
          />
        )}
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}
