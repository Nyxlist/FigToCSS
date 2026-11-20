import React, { useRef, useState } from 'react';
import { parsePluginExport } from '../lib/pluginImport';

export default function PluginConnect({ onLoaded }) {
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const load = (text) => {
    setError('');
    try {
      onLoaded(parsePluginExport(text));
    } catch (err) {
      setError(err.message);
    }
  };

  const readFile = async (file) => {
    if (!file) return;
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      setError('Please choose the .figtocss.json file exported by the plugin.');
      return;
    }
    setLoading(true);
    try {
      load(await file.text());
    } catch {
      setError('Could not read that file.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    readFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="plugin-connect">
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        {loading ? (
          <span className="spinner" aria-hidden="true"></span>
        ) : (
          <>
            <strong>Drop your .figtocss.json here</strong>
            <span className="input-hint">or click to choose a file</span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            readFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="input-group paste-group">
        <label htmlFor="paste-json">…or paste the copied JSON</label>
        <textarea
          id="paste-json"
          rows={4}
          placeholder='{"format":"figtocss","version":1,…}'
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={() => load(pasted)} disabled={!pasted.trim()}>
          Load pasted JSON
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="connect-note">
        <strong>Install the plugin (once)</strong>
        <ol className="install-steps">
          <li>Open the Figma desktop app.</li>
          <li>Menu → Plugins → Development → Import plugin from manifest…</li>
          <li>Choose <code>plugin/manifest.json</code> from this repository.</li>
          <li>Select layers, run <em>FigToCSS Exporter</em>, click <em>Export selection</em>, then download or copy.</li>
        </ol>
      </div>
    </div>
  );
}
