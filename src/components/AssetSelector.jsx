import React, { useCallback, useEffect, useState } from 'react';
import { fetchImageFills } from '../lib/figmaApi';
import { base64ToBytes, collectImageAssets, detectMime, exportAssetNames } from '../lib/assets';
import { collectFonts, googleFontsUrl } from '../lib/fonts';
import '../styles/AssetSelector.css';

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AssetSelector({
  fileData, selectedNodes, selectionKey, source,
  assets, setAssets, setImageAssets, setFontAssets,
  fillUrls, setFillUrls,
  onContinue, onBack,
}) {
  const [activeSection, setActiveSection] = useState('fonts');
  const [fillLoading, setFillLoading] = useState(false);
  const [fillError, setFillError] = useState('');

  const ready = assets.key === selectionKey;
  const imageAssets = ready ? assets.images : [];
  const fontAssets = ready ? assets.fonts : [];
  const isApi = source.kind === 'api';

  // Detect assets once per selection.
  useEffect(() => {
    if (ready || !fileData) return;
    setAssets({
      key: selectionKey,
      images: collectImageAssets(fileData.document, selectedNodes, source),
      fonts: collectFonts(fileData.document, selectedNodes),
    });
  }, [ready, fileData, selectedNodes, selectionKey, source, setAssets]);

  // API source: one call to /files/:key/images (Tier 2) for all fill URLs.
  const loadFills = useCallback(async () => {
    setFillLoading(true);
    setFillError('');
    try {
      const refs = imageAssets.map((a) => a.imageRef);
      setFillUrls(await fetchImageFills(source.fileKey, source.token, source.version, refs));
    } catch (err) {
      setFillError(err.message);
    } finally {
      setFillLoading(false);
    }
  }, [source, imageAssets, setFillUrls]);

  const needsFills = isApi && ready && imageAssets.length > 0 && !fillUrls && !fillError && !fillLoading;
  useEffect(() => {
    if (needsFills) loadFills();
  }, [needsFills, loadFills]);

  const previewUrl = (asset) => (isApi
    ? fillUrls?.[asset.imageRef] || null
    : source.imageUrls?.[asset.imageRef] || null);

  // Font actions
  const toggleFont = (family) => {
    setFontAssets((prev) => prev.map((f) => (f.family === family ? { ...f, included: !f.included } : f)));
  };

  const fontsUrl = googleFontsUrl(fontAssets);
  const openFontCSS = () => {
    if (fontsUrl) window.open(fontsUrl, '_blank', 'noopener');
  };

  // Image actions
  const toggleImage = (imageRef) => {
    setImageAssets((prev) => prev.map((img) => (img.imageRef === imageRef ? { ...img, included: !img.included } : img)));
  };

  // Same names as the CSS and the zip (API: extension from the downloaded bytes, like the zip).
  const fileNameFor = (imageRef, mime) => exportAssetNames(
    fileData.document, selectedNodes, source, imageAssets, mime ? { [imageRef]: mime } : {}
  ).images[imageRef];

  const downloadImage = async (asset) => {
    if (!isApi) {
      const img = source.images?.[asset.imageRef];
      if (!img?.data) return;
      const bytes = base64ToBytes(img.data);
      const mime = img.mime || detectMime(bytes);
      triggerDownload(new Blob([bytes], { type: mime }), fileNameFor(asset.imageRef));
      return;
    }
    const url = previewUrl(asset);
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = detectMime(bytes);
      triggerDownload(new Blob([bytes], { type: mime }), fileNameFor(asset.imageRef, mime));
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  };

  const includedFonts = fontAssets.filter((f) => f.included).length;
  const includedImages = imageAssets.filter((i) => i.included).length;

  return (
    <div className="asset-selector panel">
      <h2 className="panel-title">Assets</h2>
      <p className="panel-subtitle">
        Review fonts and images from your selection. Choose which to include in the output.
      </p>

      <div className="asset-tabs">
        <button
          className={`asset-tab ${activeSection === 'fonts' ? 'active' : ''}`}
          onClick={() => setActiveSection('fonts')}
        >
          🔤 Fonts ({fontAssets.length})
        </button>
        <button
          className={`asset-tab ${activeSection === 'images' ? 'active' : ''}`}
          onClick={() => setActiveSection('images')}
        >
          🖼️ Images ({imageAssets.length})
        </button>
      </div>

      {activeSection === 'fonts' && (
        <div className="asset-section">
          {fontAssets.length === 0 ? (
            <div className="asset-empty">
              <p>No fonts detected in your selection.</p>
            </div>
          ) : (
            <>
              <div className="asset-toolbar">
                <span className="asset-count">{includedFonts} of {fontAssets.length} fonts included</span>
                <button className="btn btn-secondary btn-sm" onClick={openFontCSS} disabled={!fontsUrl}>
                  ⬇ Open Google Fonts CSS
                </button>
              </div>
              <div className="font-list">
                {fontAssets.map((font) => (
                  <div key={font.family} className={`font-card ${font.included ? 'included' : 'excluded'}`}>
                    <div className="font-card-preview" style={{ fontFamily: `'${font.family}', sans-serif` }}>
                      Aa Bb Cc 123
                    </div>
                    <div className="font-card-info">
                      <span className="font-card-name">{font.family}</span>
                      <span className="font-card-meta">
                        {font.count} usage{font.count !== 1 ? 's' : ''} •
                        Weights: {font.weights.join(', ')}
                        {font.italic ? ' • italic' : ''}
                      </span>
                      <span className={`font-card-badge ${font.isGoogleFont ? 'google' : 'custom'}`}>
                        {font.isGoogleFont ? '✓ Google Fonts' : '⚠ Custom font'}
                      </span>
                    </div>
                    <label className="asset-toggle">
                      <input type="checkbox" checked={font.included} onChange={() => toggleFont(font.family)} />
                      <span>{font.included ? 'Included' : 'Excluded'}</span>
                    </label>
                  </div>
                ))}
              </div>
              <p className="asset-hint">
                Fonts marked "Google Fonts" are linked from Google Fonts. Custom fonts need to be self-hosted — download them separately.
              </p>
            </>
          )}
        </div>
      )}

      {activeSection === 'images' && (
        <div className="asset-section">
          {imageAssets.length === 0 ? (
            <div className="asset-empty">
              <p>No image fills found in your selection.</p>
              <p className="asset-hint">Solid colors and gradients are converted to CSS directly.</p>
            </div>
          ) : (
            <>
              {fillLoading && (
                <div className="asset-loading">
                  <span className="spinner"></span>
                  <p>Loading image fill URLs from Figma…</p>
                </div>
              )}
              {fillError && (
                <div className="asset-error">
                  <p className="error-message">Could not load images from Figma: {fillError}</p>
                  <button className="btn btn-secondary btn-sm" onClick={loadFills} disabled={fillLoading}>
                    Retry
                  </button>
                </div>
              )}
              <div className="asset-toolbar">
                <span className="asset-count">{includedImages} of {imageAssets.length} images included</span>
                <span className="asset-hint">Download everything at once with “Download .zip” on the next step.</span>
              </div>
              <div className="images-grid">
                {imageAssets.map((asset) => {
                  const url = previewUrl(asset);
                  return (
                    <div key={asset.imageRef} className={`image-card ${asset.included ? 'included' : 'excluded'}`}>
                      <div className="image-card-preview">
                        {url ? (
                          <img src={url} alt={asset.name} className="image-card-img" loading="lazy" />
                        ) : (
                          <div className="image-card-placeholder"><span>⚠️</span></div>
                        )}
                        {url && (
                          <button className="image-download-btn" onClick={() => downloadImage(asset)} title="Download">⬇</button>
                        )}
                      </div>
                      <div className="image-card-info">
                        <span className="image-card-name">{asset.name}</span>
                        <span className="image-card-size">
                          {Math.round(asset.width)}×{Math.round(asset.height)}
                        </span>
                        <span className="image-card-size" title={asset.layers.map((l) => l.path).join('\n')}>
                          Used by {asset.layers.length} layer{asset.layers.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <label className="asset-toggle">
                        <input type="checkbox" checked={asset.included} onChange={() => toggleImage(asset.imageRef)} />
                        <span>{asset.included ? 'Included' : 'Excluded'}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onContinue} disabled={!ready}>
          Generate CSS →
        </button>
      </div>
    </div>
  );
}
