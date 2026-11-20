import React, { useEffect, useRef, useState } from 'react';
import { fetchNodeRender, getCachedRender } from '../lib/figmaApi';
import '../styles/ComparePane.css';

/**
 * Compare view: generated output next to (or under) the Figma render.
 * Plugin sources ship renders; API renders are only fetched on request.
 */
export default function ComparePane({
  source, nodeId, previewHTML, width, height, mode, overlayOpacity, zoom, stageRef,
}) {
  const iframeRef = useRef(null);
  const [apiRender, setApiRender] = useState({ nodeId: null, url: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isApi = source.kind === 'api';
  const renderUrl = isApi
    ? (apiRender.nodeId === nodeId ? apiRender.url : null)
    : source.renderUrls?.[nodeId] || null;

  // API: show a cached render if we have one; never hit the network here.
  useEffect(() => {
    if (!isApi || !nodeId) return undefined;
    let cancelled = false;
    setError('');
    getCachedRender(source.fileKey, source.version, nodeId).then((url) => {
      if (!cancelled && url) setApiRender({ nodeId, url });
    });
    return () => { cancelled = true; };
  }, [isApi, source.fileKey, source.version, nodeId]);

  useEffect(() => {
    if (iframeRef.current && previewHTML) iframeRef.current.srcdoc = previewHTML;
  }, [previewHTML, mode]);

  const loadRender = async () => {
    setLoading(true);
    setError('');
    try {
      const url = await fetchNodeRender(source.fileKey, source.token, source.version, nodeId);
      setApiRender({ nodeId, url });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const size = { width, height };
  const placeholder = (
    <div className="compare-placeholder" style={size}>
      <div className="placeholder-content">
        {loading ? (
          <>
            <span className="spinner"></span>
            <p>Loading…</p>
          </>
        ) : isApi ? (
          <>
            <span className="placeholder-icon">🎨</span>
            <button className="btn btn-secondary btn-sm" onClick={loadRender}>
              Load Figma render (uses 1 monthly API call)
            </button>
            {error && <p className="error-message">{error}</p>}
          </>
        ) : (
          <>
            <span className="placeholder-icon">🎨</span>
            <p>No render in this export</p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="preview-stage" ref={stageRef}>
      <div className="compare-wrapper" style={{ zoom: zoom / 100 }}>
        {mode === 'side' && (
          <div className="compare-side-by-side">
            <div className="compare-panel">
              <div className="compare-panel-label">CSS Output</div>
              <iframe ref={iframeRef} className="preview-iframe compare-iframe" title="CSS" sandbox="allow-same-origin" style={size} />
            </div>
            <div className="compare-panel">
              <div className="compare-panel-label">Figma Design</div>
              {renderUrl ? <img src={renderUrl} alt="Figma render" className="compare-figma-img" style={size} /> : placeholder}
            </div>
          </div>
        )}
        {mode === 'overlay' && (
          <div className="compare-overlay" style={size}>
            <iframe ref={iframeRef} className="preview-iframe compare-iframe overlay-base" title="CSS" sandbox="allow-same-origin" style={size} />
            {renderUrl ? (
              <img src={renderUrl} alt="Figma render" className="compare-figma-img overlay-top" style={{ ...size, opacity: overlayOpacity / 100 }} />
            ) : (
              <div className="overlay-notice overlay-notice--action">
                {isApi ? (
                  <button className="btn btn-secondary btn-sm" onClick={loadRender} disabled={loading}>
                    {loading ? 'Loading…' : 'Load Figma render (uses 1 monthly API call)'}
                  </button>
                ) : 'No render in this export'}
                {error && <p className="error-message">{error}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
