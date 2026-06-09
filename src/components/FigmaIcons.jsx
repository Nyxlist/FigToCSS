import React from 'react';

/**
 * SVG icons matching Figma's layer panel icon style.
 * Each icon is 16x16 with consistent stroke/fill styling.
 */

export function FrameIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 1v14M13 1v14M1 3h14M1 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ComponentIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L10.5 4L8 6.5L5.5 4L8 1.5Z" fill="currentColor" />
      <path d="M8 9.5L10.5 12L8 14.5L5.5 12L8 9.5Z" fill="currentColor" />
      <path d="M12 5.5L14.5 8L12 10.5L9.5 8L12 5.5Z" fill="currentColor" />
      <path d="M4 5.5L6.5 8L4 10.5L1.5 8L4 5.5Z" fill="currentColor" />
    </svg>
  );
}

export function InstanceIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" transform="rotate(45 8 8)" />
    </svg>
  );
}

export function GroupIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
    </svg>
  );
}

export function TextIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 3h10M8 3v10M5.5 3v1.5M10.5 3v1.5M6.5 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function RectangleIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3.5" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function EllipseIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="8" rx="5.5" ry="5.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function VectorIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14L8 2l6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LineIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BooleanIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function PageIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SectionIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.5 5h13" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function SliceIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 2h4v4H2zM10 10h4v4h-4z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 12L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
    </svg>
  );
}

export function ImageIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" />
      <path d="M2 11l3.5-3.5L8 10l2.5-3L14 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICON_MAP = {
  DOCUMENT: PageIcon,
  CANVAS: PageIcon,
  FRAME: FrameIcon,
  GROUP: GroupIcon,
  COMPONENT: ComponentIcon,
  COMPONENT_SET: ComponentIcon,
  INSTANCE: InstanceIcon,
  TEXT: TextIcon,
  RECTANGLE: RectangleIcon,
  ELLIPSE: EllipseIcon,
  VECTOR: VectorIcon,
  STAR: VectorIcon,
  REGULAR_POLYGON: VectorIcon,
  LINE: LineIcon,
  BOOLEAN_OPERATION: BooleanIcon,
  SECTION: SectionIcon,
  SLICE: SliceIcon,
};

export function NodeIcon({ type, className }) {
  const IconComponent = ICON_MAP[type] || RectangleIcon;
  return <IconComponent className={className} />;
}
