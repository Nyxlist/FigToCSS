import React, { useCallback, useState } from 'react';
import ConnectStep from './components/ConnectStep';
import TreeBrowser from './components/TreeBrowser';
import SettingsPanel from './components/SettingsPanel';
import AssetSelector from './components/AssetSelector';
import CSSOutput from './components/CSSOutput';
import { revokeSourceUrls } from './lib/assets';
import './styles/App.css';

const STEPS = ['Connect', 'Select', 'Settings', 'Assets', 'Generate'];
const EMPTY_ASSETS = { key: null, images: [], fonts: [] };

export default function App() {
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [fileData, setFileData] = useState(null);
  const [source, setSource] = useState(null);
  const [selectedNodes, setSelectedNodesRaw] = useState([]);
  const [settings, setSettings] = useState({
    namingMode: 'figma',
    customPrefix: '',
    includeVariables: true,
    layoutMethod: 'flexbox',
    includeDimensions: true,
  });
  const [assets, setAssets] = useState(EMPTY_ASSETS);
  const [fillUrls, setFillUrls] = useState(null); // API source: imageRef → URL

  const selectionKey = selectedNodes.map((n) => n.id).join(',');

  const goTo = (next) => {
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
  };

  // Changing the selection invalidates the detected assets and later steps.
  const setSelectedNodes = useCallback((updater) => {
    setSelectedNodesRaw(updater);
    setMaxStep((m) => Math.min(m, 1));
  }, []);

  const setImageAssets = useCallback((updater) => {
    setAssets((prev) => ({ ...prev, images: typeof updater === 'function' ? updater(prev.images) : updater }));
  }, []);

  const setFontAssets = useCallback((updater) => {
    setAssets((prev) => ({ ...prev, fonts: typeof updater === 'function' ? updater(prev.fonts) : updater }));
  }, []);

  const clearSession = () => {
    revokeSourceUrls(source);
    setFileData(null);
    setSource(null);
    setSelectedNodesRaw([]);
    setAssets(EMPTY_ASSETS);
    setFillUrls(null);
  };

  const handleLoaded = ({ fileData: data, source: nextSource }) => {
    clearSession();
    setFileData(data);
    setSource(nextSource);
    setStep(1);
    setMaxStep(1);
  };

  const handleReset = () => {
    clearSession();
    setStep(0);
    setMaxStep(0);
  };

  const canGoTo = (i) => {
    if (i > maxStep) return false;
    if (i === 0) return true;
    if (!fileData) return false;
    if (i === 1) return true;
    if (selectedNodes.length === 0) return false;
    if (i === 4) return assets.key === selectionKey;
    return true;
  };

  let sourceBadge = null;
  if (source?.kind === 'plugin') sourceBadge = 'plugin export';
  else if (source) sourceBadge = source.fromCache ? 'API (cached)' : 'API';

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h7v7h-7z" strokeDasharray="2 2" />
          </svg>
          <span>Figma → CSS</span>
        </div>
        <nav className="app-steps">
          {STEPS.map((label, i) => (
            <button
              key={label}
              className={`step-indicator ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => i !== step && setStep(i)}
              disabled={!canGoTo(i)}
            >
              <span className="step-number">{i < step ? '✓' : i + 1}</span>
              <span className="step-label">{label}</span>
            </button>
          ))}
        </nav>
        {source && (
          <div className="app-source">
            <span className="app-source-name" title={source.fileName}>{source.fileName}</span>
            <span className={`app-source-badge ${source.kind}`}>{sourceBadge}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleReset}>Start over</button>
          </div>
        )}
      </header>

      {source?.notice && <div className="app-notice">{source.notice}</div>}
      {source?.kind === 'plugin' && source.warnings.length > 0 && step === 1 && (
        <div className="app-notice">
          The plugin reported {source.warnings.length} warning{source.warnings.length !== 1 ? 's' : ''}:{' '}
          {source.warnings.slice(0, 3).join(' · ')}
          {source.warnings.length > 3 ? ' …' : ''}
        </div>
      )}

      <main className="app-main">
        {step === 0 && <ConnectStep onLoaded={handleLoaded} />}
        {step === 1 && (
          <TreeBrowser
            fileData={fileData}
            selectedNodes={selectedNodes}
            setSelectedNodes={setSelectedNodes}
            onContinue={() => selectedNodes.length > 0 && goTo(2)}
            onBack={handleReset}
          />
        )}
        {step === 2 && (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            selectedCount={selectedNodes.length}
            onContinue={() => goTo(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <AssetSelector
            fileData={fileData}
            selectedNodes={selectedNodes}
            selectionKey={selectionKey}
            source={source}
            assets={assets}
            setAssets={setAssets}
            setImageAssets={setImageAssets}
            setFontAssets={setFontAssets}
            fillUrls={fillUrls}
            setFillUrls={setFillUrls}
            onContinue={() => goTo(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <CSSOutput
            fileData={fileData}
            selectedNodes={selectedNodes}
            settings={settings}
            source={source}
            imageAssets={assets.images}
            fontAssets={assets.fonts}
            fillUrls={fillUrls}
            onBack={() => setStep(3)}
          />
        )}
      </main>
    </div>
  );
}
