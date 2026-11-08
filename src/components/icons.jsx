// A small hand-drawn icon set on a 16px grid: 1.25px strokes, no fills, no
// decorative arrows on buttons. Icons only label actions that already have words.

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
}

export function PlusIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  )
}

export function PanelIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1.5" />
      <path d="M6.25 3.25v9.5" />
    </svg>
  )
}

export function SendIcon(props) {
  return (
    <svg {...base} {...props} strokeWidth={1.5}>
      <path d="M8 13V3.5M3.9 7.4 8 3.3l4.1 4.1" />
    </svg>
  )
}

export function StopIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CopyIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.5" />
      <path d="M10.25 3.75a1 1 0 0 0-1-1H3.75a1 1 0 0 0-1 1v5.5" />
    </svg>
  )
}

export function CheckIcon(props) {
  return (
    <svg {...base} {...props} strokeWidth={1.5}>
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  )
}

export function ChevronDown(props) {
  return (
    <svg {...base} {...props}>
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </svg>
  )
}

export function TrashIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4.75h10M6.25 4.75V3.5h3.5v1.25M4.25 4.75l.6 7.5a1 1 0 0 0 1 .9h4.3a1 1 0 0 0 1-.9l.6-7.5" />
    </svg>
  )
}

export function PencilIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10.6 2.9a1.4 1.4 0 0 1 2 2l-7 7-2.8.8.8-2.8z" />
    </svg>
  )
}

export function GearIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 2.2v1.4M8 12.4v1.4M2.2 8h1.4M12.4 8h1.4M3.9 3.9l1 1M11.1 11.1l1 1M12.1 3.9l-1 1M4.9 11.1l-1 1" />
    </svg>
  )
}

export function SunIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 2v1.2M8 12.8V14M2 8h1.2M12.8 8H14M3.8 3.8l.9.9M11.3 11.3l.9.9M12.2 3.8l-.9.9M4.7 11.3l-.9.9" />
    </svg>
  )
}

export function MoonIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12.6 9.6A5.2 5.2 0 0 1 6.4 3.4a5.2 5.2 0 1 0 6.2 6.2z" />
    </svg>
  )
}

export function SearchIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="7.2" cy="7.2" r="3.95" />
      <path d="m10.2 10.2 3 3" />
    </svg>
  )
}

export function CloseIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}

export function AlertIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5.25v3.5" />
      <circle cx="8" cy="10.85" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function DownloadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 2.75v7M5.1 7.1 8 10l2.9-2.9M3 12.75h10" />
    </svg>
  )
}

export function Spinner({ className = '' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className={`spinner shrink-0 ${className}`}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path
        d="M13.75 8A5.75 5.75 0 0 0 8 2.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
