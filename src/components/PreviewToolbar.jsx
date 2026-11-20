import React from 'react';

export const DEVICES = {
  desktop: { label: 'Desktop', width: 1440, height: 900, icon: '🖥️' },
  tablet: { label: 'Tablet', width: 768, height: 1024, icon: '📱' },
  phone: { label: 'Phone', width: 375, height: 812, icon: '📲' },
  phoneLandscape: { label: 'Phone ↔', width: 812, height: 375, icon: '📲' },
};

export const BACKGROUNDS = [
  { label: 'Dark', value: '#1a1a1f' },
  { label: 'Light', value: '#ffffff' },
  { label: 'Gray', value: '#f3f4f6' },
  { label: 'Checker', value: 'checker' },
];

export default function PreviewToolbar({
  device, setDevice, bgOption, setBgOption, zoom, setZoom, onFit,
  showCompare, compareMode, setCompareMode, overlayOpacity, setOverlayOpacity,
}) {
  return (
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
        <button className="zoom-btn" onClick={() => setZoom((z) => Math.max(10, (z ?? 50) - 10))}>−</button>
        <span className="zoom-value">{zoom}%</span>
        <button className="zoom-btn" onClick={() => setZoom((z) => Math.min(300, (z ?? 50) + 10))}>+</button>
        <button className="zoom-btn zoom-fit" onClick={onFit} title="Fit">⊡</button>
      </div>
      {showCompare && (
        <>
          <div className="toolbar-divider" />
          <div className="compare-controls">
            <button className={`device-btn ${compareMode === 'side' ? 'active' : ''}`} onClick={() => setCompareMode('side')}>Side by Side</button>
            <button className={`device-btn ${compareMode === 'overlay' ? 'active' : ''}`} onClick={() => setCompareMode('overlay')}>Overlay</button>
          </div>
          {compareMode === 'overlay' && (
            <div className="overlay-slider">
              <span className="overlay-label">Figma</span>
              <input type="range" min="0" max="100" value={overlayOpacity} onChange={(e) => setOverlayOpacity(+e.target.value)} className="opacity-range" />
              <span className="overlay-value">{overlayOpacity}%</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
