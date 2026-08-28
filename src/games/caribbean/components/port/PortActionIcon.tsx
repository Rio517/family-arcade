export type PortActionIconName = 'governor' | 'tavern' | 'market' | 'shipyard' | 'shares' | 'log' | 'set-sail';

export function PortActionIcon({ name }: { name: PortActionIconName }) {
  return (
    <svg
      className="caribbean-port-action-icon"
      data-port-icon={name}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'governor' && <><path d="M8 39h32M11 36h26M14 36V20h20v16M11 20h26L24 8 11 20Z" /><path d="M20 36V25h8v11" /></>}
      {name === 'tavern' && <><path d="M13 10h20l-2 15c-.6 4-3.5 7-8 7s-7.4-3-8-7l-2-15Z" /><path d="M23 32v7M16 39h14M33 15h4c3 0 4 2 4 5s-2 5-8 5" /></>}
      {name === 'market' && <><path d="M8 18h32l-4-8H12l-4 8ZM11 18v21h26V18" /><path d="M18 39V27h12v12M8 18c0 4 6 5 8 1 2 4 7 4 9 0 2 4 7 4 9 0 2 4 6 3 6-1" /></>}
      {name === 'shipyard' && <><path d="m7 30 5 9h25l5-9H7ZM13 30l4-13h14l4 13M24 17V7M24 9l10 7H24" /></>}
      {name === 'shares' && <><circle cx="18" cy="17" r="6" /><circle cx="33" cy="20" r="5" /><path d="M7 39c1-9 5-14 11-14s10 5 11 14M26 28c7-2 13 2 14 11" /></>}
      {name === 'log' && <><path d="M12 9h25v30H12c-3 0-5-2-5-5V14c0-3 2-5 5-5Z" /><path d="M12 9v30M18 17h13M18 24h13M18 31h9" /></>}
      {name === 'set-sail' && <><path d="M7 35c8 4 26 4 34 0l-4 7H12l-5-7ZM23 35V6M25 9l12 20H25V9ZM21 14 11 29h10V14Z" /></>}
    </svg>
  );
}
