import { createRoot } from 'react-dom/client';
import '@shared/styles/tokens.css';

import { CaribbeanLab } from './components/CaribbeanLab';
import type { NavalSessionSnapshot, NavalSessionView } from './state/naval/NavalSession';

declare global {
  interface Window {
    __CARIBBEAN_NAVAL_DEBUG__?: {
      getSnapshot(): NavalSessionSnapshot;
      consumeNewEvents(afterId: number): ReturnType<NavalSessionView['consumeNewEvents']>;
      restart(): void;
    };
  }
}

function exposeDebugSession(session: NavalSessionView): void {
  window.__CARIBBEAN_NAVAL_DEBUG__ = {
    getSnapshot: session.getSnapshot,
    consumeNewEvents: (afterId) => session.consumeNewEvents(afterId),
    restart: () => session.restart(),
  };
}

createRoot(document.getElementById('root')!).render(
  <div className="app caribbean-app">
    <CaribbeanLab sceneFactory={null} onSessionReady={exposeDebugSession} />
  </div>,
);
