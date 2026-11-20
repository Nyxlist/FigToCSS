import React, { useState } from 'react';
import { extractFileKey, loadFigmaFile } from '../lib/figmaApi';

const TOKEN_KEY = 'figtocss.token';

function readSavedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function saveToken(token, remember) {
  try {
    if (remember) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode); nothing to persist.
  }
}

export default function TokenConnect({ onLoaded }) {
  const [inputMode, setInputMode] = useState('url'); // 'url' | 'key'
  const [figmaUrl, setFigmaUrl] = useState('');
  const [fileKey, setFileKey] = useState('');
  const [accessToken, setAccessToken] = useState(readSavedToken);
  const [remember, setRemember] = useState(() => Boolean(readSavedToken()));
  const [forceReload, setForceReload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setError('');
    const key = inputMode === 'url' ? extractFileKey(figmaUrl) : fileKey.trim();
    if (!key) {
      setError(inputMode === 'url'
        ? 'Invalid Figma URL. Paste a link to a Figma design, prototype or board.'
        : 'Please provide a Figma file key.');
      return;
    }
    const token = accessToken.trim();
    if (!token) {
      setError('Please provide your Figma personal access token.');
      return;
    }

    setLoading(true);
    saveToken(token, remember);
    try {
      const { data, version, fromCache, notice } = await loadFigmaFile(key, token, { force: forceReload });
      onLoaded({
        fileData: data,
        source: { kind: 'api', token, fileKey: key, version, fileName: data.name || key, fromCache, notice },
      });
    } catch (err) {
      setError(err.message || 'Failed to connect to Figma. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="token-connect">
      <div className="connect-note connect-note--warning">
        Free, View and Collab seats get only a few API file reads per month (limits apply per token owner).
        Each new file load, and each Figma render in Compare, uses one. The plugin export has no limits.
      </div>

      <div className="input-mode-toggle">
        <button className={`toggle-btn ${inputMode === 'url' ? 'active' : ''}`} onClick={() => setInputMode('url')}>
          File URL
        </button>
        <button className={`toggle-btn ${inputMode === 'key' ? 'active' : ''}`} onClick={() => setInputMode('key')}>
          File Key
        </button>
      </div>

      {inputMode === 'url' ? (
        <div className="input-group">
          <label htmlFor="figma-url">Figma File URL</label>
          <input
            id="figma-url"
            type="url"
            placeholder="https://www.figma.com/design/ABC123/MyDesign"
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

      <label className="connect-checkbox">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember token on this device
      </label>
      <label className="connect-checkbox">
        <input type="checkbox" checked={forceReload} onChange={(e) => setForceReload(e.target.checked)} />
        Force reload from Figma (uses 1 monthly call)
      </label>

      {error && <p className="error-message">{error}</p>}

      <button className="btn btn-primary connect-btn" onClick={handleConnect} disabled={loading}>
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
