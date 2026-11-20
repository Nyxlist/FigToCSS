import React, { useState } from 'react';
import PluginConnect from './PluginConnect';
import TokenConnect from './TokenConnect';
import '../styles/ConnectStep.css';

export default function ConnectStep({ onLoaded }) {
  const [method, setMethod] = useState('plugin'); // 'plugin' | 'api'

  return (
    <div className="connect-step panel">
      <h2 className="panel-title">Load a Figma design</h2>
      <p className="panel-subtitle">
        Export your selection with the FigToCSS plugin, or load a file through the Figma API.
      </p>

      <div className="input-mode-toggle">
        <button
          className={`toggle-btn ${method === 'plugin' ? 'active' : ''}`}
          onClick={() => setMethod('plugin')}
        >
          Plugin export <span className="toggle-badge">Recommended · no rate limits</span>
        </button>
        <button
          className={`toggle-btn ${method === 'api' ? 'active' : ''}`}
          onClick={() => setMethod('api')}
        >
          API token
        </button>
      </div>

      {method === 'plugin' ? <PluginConnect onLoaded={onLoaded} /> : <TokenConnect onLoaded={onLoaded} />}
    </div>
  );
}
