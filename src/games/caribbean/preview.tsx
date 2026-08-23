import { createRoot } from 'react-dom/client';
import '@shared/styles/tokens.css';

import { CaribbeanLab } from './components/CaribbeanLab';
import { createNavalDebugBridge, type NavalDebugBridge } from './state/naval/debugBridge';
import type { NavalSessionView } from './state/naval/NavalSession';

declare global {
  interface Window {
    __CARIBBEAN_NAVAL_DEBUG__?: NavalDebugBridge;
  }
}

function exposeDebugSession(session: NavalSessionView): void {
  window.__CARIBBEAN_NAVAL_DEBUG__ = createNavalDebugBridge(session);
}

createRoot(document.getElementById('root')!).render(
  <div className="app caribbean-app">
    <CaribbeanLab onSessionReady={exposeDebugSession} />
  </div>,
);
