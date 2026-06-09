import React, { useState } from 'react';
import '../styles/ConnectStep.css';

export default function ConnectStep({ onFileLoaded }) {
  const [inputMode, setInputMode] = useState('url'); // 'url' | 'key'
  const [figmaUrl, setFigmaUrl] = useState('');
  const [fileKey, setFileKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const extractFileKey = (url) => {
    // Supports: https://www.figma.com/file/ABC123/... or https://www.figma.com/design/ABC123/...
    const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  };

  const handleConnect = async () => {
    setError('');
    setLoading(true);

    let key = fileKey;
    if (inputMode === 'url') {
      key = extractFileKey(figmaUrl);
      if (!key) {
        setError('Invalid Figma URL. Please paste a valid Figma file link.');
        setLoading(false);
        return;
      }
    }

    if (!key) {
      setError('Please provide a Figma file key.');
      setLoading(false);
      return;
    }

    if (!accessToken.trim()) {
      setError('Please provide your Figma personal access token.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/figma/file/${key}`, {
        headers: { 'X-Figma-Token': accessToken },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      const data = await response.json();
      onFileLoaded(data, accessToken, key);
    } catch (err) {
      setError(err.message || 'Failed to connect to Figma. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="connect-step panel">
      <h2 className="panel-title">Connect to Figma</h2>
      <p className="panel-subtitle">
        Provide your Figma file link or key along with your personal access token.
      </p>

      <div className="input-mode-toggle">
        <button
          className={`toggle-btn ${inputMode === 'url' ? 'active' : ''}`}
          onClick={() => setInputMode('url')}
        >
          File URL
        </button>
        <button
          className={`toggle-btn ${inputMode === 'key' ? 'active' : ''}`}
          onClick={() => setInputMode('key')}
        >
          File Key
        </button>
      </div>

      {inputMode === 'url' ? (
        <div className="input-group">
          <label htmlFor="figma-url">Figma File URL</label>
          <input
            id="figma-url"
            type="url"
            placeholder="https://www.figma.com/file/ABC123/MyDesign"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
          />
        </div>
      ) : (
        <div className="input-group">
          <label htmlFor="file-key">Figma File Key</label>
          <input
            id="file-key"
            type="text"
            placeholder="e.g. ABC123xyz"
            value={fileKey}
            onChange={(e) => setFileKey(e.target.value)}
          />
        </div>
      )}

      <div className="input-group">
        <label htmlFor="access-token">Personal Access Token</label>
        <input
          id="access-token"
          type="password"
          placeholder="figd_xxxxxxxxxxxxxxxxxxxxxx"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
        <span className="input-hint">
          Generate one at{' '}
          <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noreferrer">
            Figma Settings → Personal Access Tokens
          </a>
        </span>
      </div>

      {error && <p className="error-message">{error}</p>}

      <button
        className="btn btn-primary connect-btn"
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true"></span>
            Connecting…
          </>
        ) : (
          'Connect & Load File'
        )}
      </button>
    </div>
  );
}
