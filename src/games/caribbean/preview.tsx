import { createRoot } from 'react-dom/client';
import '@shared/styles/tokens.css';

import { CaribbeanLab } from './components/CaribbeanLab';
import type { NavalSceneFactory } from './components/battle/NavalViewport';
import { createNavalDebugBridge, type NavalDebugBridge } from './state/naval/debugBridge';
import { readNavalHarnessConfig } from './state/naval/harnessConfig';
import type { NavalSessionView } from './state/naval/NavalSession';

declare global {
  interface Window {
    __CARIBBEAN_NAVAL_DEBUG__?: NavalDebugBridge;
  }
}

function exposeDebugSession(session: NavalSessionView): void {
  window.__CARIBBEAN_NAVAL_DEBUG__ = createNavalDebugBridge(session);
}

const harness = readNavalHarnessConfig(window.location.search);
const forcedFailureFactory: NavalSceneFactory | undefined = harness.forceWebglFailure
  ? async () => { throw new Error('Harness-forced WebGL construction failure'); }
  : undefined;

createRoot(document.getElementById('root')!).render(
  <div className="app caribbean-app">
    <CaribbeanLab
      battleInput={harness.battleInput}
      sceneFactory={forcedFailureFactory}
      onSessionReady={exposeDebugSession}
    />
  </div>,
);
