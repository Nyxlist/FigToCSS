import React, { useState } from 'react';
import '../styles/CodeView.css';

export default function CodeView({ css, html }) {
  const [tab, setTab] = useState('css');
  const code = tab === 'css' ? css : html;
  const empty = tab === 'css' ? '/* No CSS generated */' : '<!-- No HTML generated -->';

  return (
    <>
      <div className="code-tabs">
        <button className={`code-tab ${tab === 'css' ? 'active' : ''}`} onClick={() => setTab('css')}>styles.css</button>
        <button className={`code-tab ${tab === 'html' ? 'active' : ''}`} onClick={() => setTab('html')}>HTML</button>
      </div>
      <div className="code-container">
        <div className="code-line-numbers" aria-hidden="true">
          {code && code.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}
        </div>
        <pre className="css-code"><code>{code || empty}</code></pre>
      </div>
    </>
  );
}
