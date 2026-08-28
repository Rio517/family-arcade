export type PortStatusIconName = 'port' | 'gold' | 'crew' | 'morale' | 'ship' | 'provisions';

export function PortStatusIcon({ name }: { name: PortStatusIconName }) {
  return (
    <svg
      className="caribbean-port-status-icon"
      data-port-status-icon={name}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'port' && <><circle cx="16" cy="16" r="12" /><path d="m16 3 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z" /><circle cx="16" cy="16" r="2.4" /></>}
      {name === 'gold' && <><ellipse cx="15" cy="9" rx="9" ry="4" /><path d="M6 9v5c0 2 4 4 9 4s9-2 9-4V9M8 17v4c0 2 4 4 9 4s9-2 9-4v-5" /><path d="M15 12v3M18 20v3" /></>}
      {name === 'crew' && <><circle cx="11" cy="11" r="4" /><circle cx="22" cy="12" r="3.4" /><path d="M3.5 27c.4-7 3-11 7.5-11s7.1 4 7.5 11M17 18c5-1.2 9.4 2.2 10.5 9" /></>}
      {name === 'morale' && <><path d="M16 28V5M16 10c-4-5-8-3-8 1 0 3 3 5 8 7M16 12c4-5 8-3 8 1 0 3-3 5-8 7" /><path d="m11 25 5 4 5-4M13 6l3-3 3 3" /></>}
      {name === 'ship' && <><path d="M3 23c7 3 19 3 26 0l-3 6H7l-4-6ZM15 23V4M17 6l9 14h-9V6ZM13 10 6 20h7V10Z" /></>}
      {name === 'provisions' && <><path d="M8 5h16l2 5-2 17H8L6 10l2-5ZM7 10h18M10 5c2 3 10 3 12 0M10 27c2-3 10-3 12 0" /><path d="M11 13v11M21 13v11" /></>}
    </svg>
  );
}
