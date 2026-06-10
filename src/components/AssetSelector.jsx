import React, { useEffect, useState, useCallback } from 'react';
import { fetchFigmaImages } from '../lib/figmaApi';
import '../styles/AssetSelector.css';

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

function findFontsInSelection(document, selectedNodeIds) {
  const fonts = new Map(); // family → { count, weights }

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

  function traverse(node) {
    if (node.style?.fontFamily) {
      const family = node.style.fontFamily;
      const weight = node.style.fontWeight || 400;
      if (!fonts.has(family)) {
        fonts.set(family, { count: 0, weights: new Set() });
      }
      const entry = fonts.get(family);
      entry.count++;
      entry.weights.add(weight);
    }
    if (node.children) node.children.forEach(traverse);
  }

  selectedNodeIds.forEach((sel) => {
    const node = findNode(document, sel.id);
    if (node) traverse(node);
  });

  return [...fonts.entries()].map(([family, { count, weights }]) => ({
    family,
    count,
    weights: [...weights].sort((a, b) => a - b),
    isGoogleFont: GOOGLE_FONTS.has(family),
    included: true,
  }));
}

function findImageNodes(document, selectedNodeIds) {
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

  const imageNodes = [];
  function traverse(node, path = '') {
    const currentPath = path ? `${path} / ${node.name}` : node.name;
    if (node.fills?.some((f) => f.type === 'IMAGE' && f.visible !== false)) {
      imageNodes.push({
        nodeId: node.id,
        name: node.name,
        path: currentPath,
        width: node.absoluteBoundingBox?.width || 0,
        height: node.absoluteBoundingBox?.height || 0,
      });
    }
    if (node.children) {
      node.children.forEach((child) => {
        if (child.visible !== false) traverse(child, currentPath);
      });
    }
  }

  selectedNodeIds.forEach((sel) => {
    const node = findNode(document, sel.id);
    if (node) traverse(node);
  });

  return imageNodes;
}

export default function AssetSelector({
  fileData, selectedNodes, token, fileKey,
  imageAssets, setImageAssets, fontAssets, setFontAssets,
  onContinue, onBack,
}) {
  const [activeSection, setActiveSection] = useState('fonts');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageProgress, setImageProgress] = useState({ loaded: 0, total: 0 });

  // Detect fonts
  useEffect(() => {
    if (fileData && selectedNodes.length > 0 && fontAssets.length === 0) {
      const fonts = findFontsInSelection(fileData.document, selectedNodes);
      setFontAssets(fonts);
    }
  }, [fileData, selectedNodes]);

  // Detect and fetch images (batched, fast)
  const fetchImages = useCallback(async () => {
    if (!fileData || selectedNodes.length === 0) return;
    const imageNodes = findImageNodes(fileData.document, selectedNodes);
    if (imageNodes.length === 0) {
      setImageAssets([]);
      return;
    }

    setImageLoading(true);
    setImageError('');
    setImageProgress({ loaded: 0, total: imageNodes.length });

    try {
      const nodeIds = imageNodes.map((n) => n.nodeId);
      const data = await fetchFigmaImages(fileKey, token, nodeIds, {
        format: 'png',
        scale: '2',
        onProgress: (loaded, total) => setImageProgress({ loaded, total }),
      });
      const assets = imageNodes.map((node) => ({
        ...node,
        url: data.images?.[node.nodeId] || null,
        included: true,
      }));
      setImageAssets(assets);
    } catch (err) {
      setImageError(err.message);
      setImageAssets(imageNodes.map((n) => ({ ...n, url: null, included: true })));
    } finally {
      setImageLoading(false);
    }
  }, [fileData, selectedNodes, fileKey, token, setImageAssets]);

  useEffect(() => {
    if (imageAssets.length === 0) fetchImages();
  }, []);

  // Font actions
  const toggleFont = (family) => {
    setFontAssets((prev) => prev.map((f) => f.family === family ? { ...f, included: !f.included } : f));
  };

  const downloadFontCSS = () => {
    const included = fontAssets.filter((f) => f.included && f.isGoogleFont);
    if (included.length === 0) return;
    const families = included.map((f) => {
      const weights = f.weights.join(';');
      return `family=${encodeURIComponent(f.family)}:wght@${weights}`;
    }).join('&');
    const url = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    window.open(url, '_blank');
  };

  // Image actions
  const toggleImage = (nodeId) => {
    setImageAssets((prev) => prev.map((img) => img.nodeId === nodeId ? { ...img, included: !img.included } : img));
  };

  const downloadImage = async (asset) => {
    if (!asset.url) return;
    try {
      const response = await fetch(asset.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use name + node ID suffix to ensure uniqueness (matches CSS class naming)
      const safeName = asset.name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
      const idSuffix = asset.nodeId.replace(/[^a-zA-Z0-9]/g, '');
      a.download = `${safeName}_${idSuffix}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(asset.url, '_blank');
    }
  };

  const downloadAllImages = async () => {
    for (const asset of imageAssets.filter((i) => i.included && i.url)) {
      await downloadImage(asset);
      await new Promise((r) => setTimeout(r, 300));
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

      {/* FONTS SECTION */}
      {activeSection === 'fonts' && (
        <div className="asset-section">
          {fontAssets.length === 0 ? (
            <div className="asset-empty">
              <p>No custom fonts detected in your selection.</p>
            </div>
          ) : (
            <>
              <div className="asset-toolbar">
                <span className="asset-count">{includedFonts} of {fontAssets.length} fonts included</span>
                <button className="btn btn-secondary btn-sm" onClick={downloadFontCSS} disabled={includedFonts === 0}>
                  ⬇ Download Font CSS
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
                Fonts marked "Google Fonts" will be loaded via CSS import. Custom fonts need to be self-hosted — download them separately.
              </p>
            </>
          )}
        </div>
      )}

      {/* IMAGES SECTION */}
      {activeSection === 'images' && (
        <div className="asset-section">
          {imageLoading ? (
            <div className="asset-loading">
              <span className="spinner"></span>
              <p>Loading images: {imageProgress.loaded}/{imageProgress.total}</p>
              {imageProgress.total > 0 && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(imageProgress.loaded / imageProgress.total) * 100}%` }} />
                </div>
              )}
            </div>
          ) : imageAssets.length === 0 ? (
            <div className="asset-empty">
              <p>No image fills found in your selection.</p>
              <p className="asset-hint">Solid colors and gradients are converted to CSS directly.</p>
            </div>
          ) : (
            <>
              {imageError && <p className="error-message">{imageError}</p>}
              <div className="asset-toolbar">
                <span className="asset-count">{includedImages} of {imageAssets.length} images included</span>
                <button className="btn btn-secondary btn-sm" onClick={downloadAllImages} disabled={includedImages === 0}>
                  ⬇ Download All ({includedImages})
                </button>
              </div>
              <div className="images-grid">
                {imageAssets.map((asset) => (
                  <div key={asset.nodeId} className={`image-card ${asset.included ? 'included' : 'excluded'}`}>
                    <div className="image-card-preview">
                      {asset.url ? (
                        <img src={asset.url} alt={asset.name} className="image-card-img" loading="lazy" />
                      ) : (
                        <div className="image-card-placeholder"><span>⚠️</span></div>
                      )}
                      {asset.url && (
                        <button className="image-download-btn" onClick={() => downloadImage(asset)} title="Download">⬇</button>
                      )}
                    </div>
                    <div className="image-card-info">
                      <span className="image-card-name">{asset.name}</span>
                      <span className="image-card-size">{Math.round(asset.width)}×{Math.round(asset.height)}</span>
                    </div>
                    <label className="asset-toggle">
                      <input type="checkbox" checked={asset.included} onChange={() => toggleImage(asset.nodeId)} />
                      <span>{asset.included ? 'Included' : 'Excluded'}</span>
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onContinue}>
          Generate CSS →
        </button>
      </div>
    </div>
  );
}
