import React from 'react';
import '../styles/SettingsPanel.css';

export default function SettingsPanel({ settings, setSettings, selectedCount, onContinue, onBack }) {
  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="settings-panel panel">
      <h2 className="panel-title">Conversion Settings</h2>
      <p className="panel-subtitle">
        Configure how your {selectedCount} selected element{selectedCount !== 1 ? 's' : ''} will be converted to CSS.
      </p>

      <div className="settings-grid">
        <div className="setting-card">
          <h3 className="setting-title">Class Naming</h3>
          <div className="setting-options">
            <label className="radio-option">
              <input
                type="radio"
                name="naming"
                checked={settings.namingMode === 'figma'}
                onChange={() => update('namingMode', 'figma')}
              />
              <div>
                <span className="radio-label">Use Figma layer names</span>
                <span className="radio-desc">Sanitized layer names become class names</span>
              </div>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="naming"
                checked={settings.namingMode === 'custom'}
                onChange={() => update('namingMode', 'custom')}
              />
              <div>
                <span className="radio-label">Custom prefix</span>
                <span className="radio-desc">Add a prefix to all generated classes</span>
              </div>
            </label>
            {settings.namingMode === 'custom' && (
              <div className="input-group" style={{ marginTop: 8 }}>
                <input
                  type="text"
                  placeholder="e.g. fig-"
                  value={settings.customPrefix}
                  onChange={(e) => update('customPrefix', e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="setting-card">
          <h3 className="setting-title">Layout Method</h3>
          <div className="setting-options">
            <label className="radio-option">
              <input
                type="radio"
                name="layout"
                checked={settings.layoutMethod === 'flexbox'}
                onChange={() => update('layoutMethod', 'flexbox')}
              />
              <div>
                <span className="radio-label">Flexbox (recommended)</span>
                <span className="radio-desc">Auto-layout → flexbox, others → absolute</span>
              </div>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="layout"
                checked={settings.layoutMethod === 'absolute'}
                onChange={() => update('layoutMethod', 'absolute')}
              />
              <div>
                <span className="radio-label">All absolute</span>
                <span className="radio-desc">Position all elements using top/left/width/height</span>
              </div>
            </label>
          </div>
        </div>

        <div className="setting-card">
          <h3 className="setting-title">Options</h3>
          <div className="setting-options">
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={settings.includeVariables}
                onChange={(e) => update('includeVariables', e.target.checked)}
              />
              <div>
                <span className="radio-label">Extract CSS Variables</span>
                <span className="radio-desc">Colors and fonts as custom properties</span>
              </div>
            </label>
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={settings.includeDimensions}
                onChange={(e) => update('includeDimensions', e.target.checked)}
              />
              <div>
                <span className="radio-label">Include Dimensions</span>
                <span className="radio-desc">Add width/height from bounding box</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn btn-primary" onClick={onContinue}>
          Generate CSS →
        </button>
      </div>
    </div>
  );
}
