import React, { useState } from 'react';
import ConnectStep from './components/ConnectStep';
import TreeBrowser from './components/TreeBrowser';
import SettingsPanel from './components/SettingsPanel';
import AssetSelector from './components/AssetSelector';
import CSSOutput from './components/CSSOutput';
import { resetApiState } from './lib/figmaApi';
import './styles/App.css';

const STEPS = ['Connect', 'Select', 'Settings', 'Assets', 'Generate'];

export default function App() {
  const [step, setStep] = useState(0);
  const [fileData, setFileData] = useState(null);
  const [token, setToken] = useState('');
  const [fileKey, setFileKey] = useState('');
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [settings, setSettings] = useState({
    namingMode: 'figma',
    customPrefix: '',
    includeVariables: true,
    layoutMethod: 'flexbox',
    includeDimensions: true,
  });
  const [imageAssets, setImageAssets] = useState([]);
  const [fontAssets, setFontAssets] = useState([]);
  const [generatedCSS, setGeneratedCSS] = useState('');

  const handleFileLoaded = (data, accessToken, key) => {
    // Clear all previous session data to avoid stale API calls
    setSelectedNodes([]);
    setImageAssets([]);
    setFontAssets([]);
    setGeneratedCSS('');
    // Set new session data
    setFileData(data);
    setToken(accessToken);
    setFileKey(key);
    setStep(1);
  };

  const handleReset = () => {
    resetApiState();
    setStep(0);
    setFileData(null);
    setToken('');
    setFileKey('');
    setSelectedNodes([]);
    setImageAssets([]);
    setFontAssets([]);
    setGeneratedCSS('');
  };

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
            <div
              key={label}
              className={`step-indicator ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            >
              <span className="step-number">{i < step ? '✓' : i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {step === 0 && <ConnectStep onFileLoaded={handleFileLoaded} />}
        {step === 1 && (
          <TreeBrowser
            fileData={fileData}
            selectedNodes={selectedNodes}
            setSelectedNodes={setSelectedNodes}
            onContinue={() => selectedNodes.length > 0 && setStep(2)}
            onBack={handleReset}
          />
        )}
        {step === 2 && (
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            selectedCount={selectedNodes.length}
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <AssetSelector
            fileData={fileData}
            selectedNodes={selectedNodes}
            token={token}
            fileKey={fileKey}
            imageAssets={imageAssets}
            setImageAssets={setImageAssets}
            fontAssets={fontAssets}
            setFontAssets={setFontAssets}
            onContinue={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <CSSOutput
            fileData={fileData}
            selectedNodes={selectedNodes}
            settings={settings}
            imageAssets={imageAssets}
            fontAssets={fontAssets}
            generatedCSS={generatedCSS}
            setGeneratedCSS={setGeneratedCSS}
            token={token}
            fileKey={fileKey}
            onBack={() => setStep(3)}
          />
        )}
      </main>
    </div>
  );
}
