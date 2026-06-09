import React, { useState, useMemo } from 'react';
import { NodeIcon } from './FigmaIcons';
import '../styles/TreeBrowser.css';

/**
 * Determines if a node type is selectable for CSS conversion.
 */
function isNodeSelectable(type) {
  return [
    'FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET',
    'INSTANCE', 'SECTION', 'RECTANGLE', 'ELLIPSE',
    'VECTOR', 'TEXT', 'LINE', 'STAR', 'REGULAR_POLYGON',
    'BOOLEAN_OPERATION',
  ].includes(type);
}

/**
 * Returns a readable label for Figma node types.
 */
function typeLabel(type) {
  const map = {
    FRAME: 'Frame',
    GROUP: 'Group',
    COMPONENT: 'Component',
    COMPONENT_SET: 'Component Set',
    INSTANCE: 'Instance',
    TEXT: 'Text',
    RECTANGLE: 'Rectangle',
    ELLIPSE: 'Ellipse',
    VECTOR: 'Vector',
    LINE: 'Line',
    STAR: 'Star',
    REGULAR_POLYGON: 'Polygon',
    BOOLEAN_OPERATION: 'Boolean',
    SECTION: 'Section',
    CANVAS: 'Page',
    DOCUMENT: 'Document',
    SLICE: 'Slice',
  };
  return map[type] || type;
}

function TreeNode({ node, depth, selectedNodes, setSelectedNodes, searchQuery }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedNodes.some((n) => n.id === node.id);
  const selectable = isNodeSelectable(node.type);

  // Check if this node or any descendant matches search
  const matchesSearch = useMemo(() => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    function matches(n) {
      if (n.name.toLowerCase().includes(q)) return true;
      if (n.children) return n.children.some(matches);
      return false;
    }
    return matches(node);
  }, [node, searchQuery]);

  if (!matchesSearch) return null;

  const toggleSelect = (e) => {
    e.stopPropagation();
    if (!selectable) return;

    if (isSelected) {
      setSelectedNodes((prev) => prev.filter((n) => n.id !== node.id));
    } else {
      setSelectedNodes((prev) => [...prev, { id: node.id, name: node.name, type: node.type }]);
    }
  };

  const handleRowClick = () => {
    if (selectable) {
      // Clicking the row selects/deselects (no need for just the checkbox)
      if (isSelected) {
        setSelectedNodes((prev) => prev.filter((n) => n.id !== node.id));
      } else {
        setSelectedNodes((prev) => [...prev, { id: node.id, name: node.name, type: node.type }]);
      }
    } else if (hasChildren) {
      setExpanded(!expanded);
    }
  };

  const handleExpandClick = (e) => {
    e.stopPropagation();
    if (hasChildren) setExpanded(!expanded);
  };

  const nameHighlight = searchQuery ? highlightMatch(node.name, searchQuery) : node.name;

  return (
    <div className="tree-node" data-depth={depth}>
      <div
        className={`tree-node-row ${isSelected ? 'selected' : ''} ${selectable ? 'selectable' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={handleRowClick}
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowClick();
          }
          if (e.key === 'ArrowRight' && hasChildren && !expanded) {
            e.preventDefault();
            setExpanded(true);
          }
          if (e.key === 'ArrowLeft' && hasChildren && expanded) {
            e.preventDefault();
            setExpanded(false);
          }
        }}
      >
        <button
          className={`tree-expand-btn ${hasChildren ? 'has-children' : ''} ${expanded ? 'open' : ''}`}
          onClick={handleExpandClick}
          tabIndex={-1}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <span className={`tree-icon ${getIconColor(node.type)}`}>
          <NodeIcon type={node.type} />
        </span>

        <span className="tree-name">{nameHighlight}</span>

        {selectable && (
          <span className={`tree-select-indicator ${isSelected ? 'active' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              {isSelected ? (
                <>
                  <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="currentColor" stroke="currentColor" />
                  <path d="M3.5 7l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <rect x="0.5" y="0.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1" />
              )}
            </svg>
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="tree-children" role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodes={selectedNodes}
              setSelectedNodes={setSelectedNodes}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function highlightMatch(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="tree-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function getIconColor(type) {
  switch (type) {
    case 'FRAME':
    case 'SECTION':
      return 'icon-blue';
    case 'COMPONENT':
    case 'COMPONENT_SET':
      return 'icon-green';
    case 'INSTANCE':
      return 'icon-purple';
    case 'TEXT':
      return 'icon-white';
    case 'GROUP':
      return 'icon-muted';
    default:
      return 'icon-muted';
  }
}

export default function TreeBrowser({ fileData, selectedNodes, setSelectedNodes, onContinue, onBack }) {
  const [searchQuery, setSearchQuery] = useState('');
  const document = fileData?.document;

  if (!document) {
    return <div className="panel">No file data loaded.</div>;
  }

  const handleSelectAll = () => {
    // Collect all selectable nodes
    const all = [];
    function collect(node) {
      if (isNodeSelectable(node.type)) {
        all.push({ id: node.id, name: node.name, type: node.type });
      }
      if (node.children) node.children.forEach(collect);
    }
    document.children?.forEach(collect);
    setSelectedNodes(all);
  };

  const handleClearAll = () => {
    setSelectedNodes([]);
  };

  return (
    <div className="tree-browser panel">
      <div className="tree-header">
        <div>
          <h2 className="panel-title">Select Elements</h2>
          <p className="panel-subtitle">
            Click any layer to select it for conversion. Use the search to find specific elements.
          </p>
        </div>
        <div className="selection-badge">
          <span className="selection-count-num">{selectedNodes.length}</span>
          <span className="selection-count-label">selected</span>
        </div>
      </div>

      <div className="tree-toolbar">
        <div className="tree-search">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search layers…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            aria-label="Search layers"
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>
        <div className="tree-toolbar-actions">
          <button className="toolbar-action-btn" onClick={handleSelectAll} title="Select all">
            Select All
          </button>
          <button className="toolbar-action-btn" onClick={handleClearAll} title="Clear selection" disabled={selectedNodes.length === 0}>
            Clear
          </button>
        </div>
      </div>

      {selectedNodes.length > 0 && (
        <div className="selection-chips">
          {selectedNodes.slice(0, 8).map((n) => (
            <span key={n.id} className="selection-chip">
              <NodeIcon type={n.type} className="chip-icon" />
              <span className="chip-name">{n.name}</span>
              <button
                className="chip-remove"
                onClick={() => setSelectedNodes((prev) => prev.filter((x) => x.id !== n.id))}
                aria-label={`Remove ${n.name}`}
              >
                ✕
              </button>
            </span>
          ))}
          {selectedNodes.length > 8 && (
            <span className="selection-chip chip-more">
              +{selectedNodes.length - 8} more
            </span>
          )}
        </div>
      )}

      <div className="tree-container" role="tree" aria-label="Figma file structure">
        {document.children?.map((page) => (
          <TreeNode
            key={page.id}
            node={page}
            depth={0}
            selectedNodes={selectedNodes}
            setSelectedNodes={setSelectedNodes}
            searchQuery={searchQuery}
          />
        ))}
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn btn-primary"
          onClick={onContinue}
          disabled={selectedNodes.length === 0}
        >
          Continue with {selectedNodes.length} element{selectedNodes.length !== 1 ? 's' : ''} →
        </button>
      </div>
    </div>
  );
}
