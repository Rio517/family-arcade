import type { NavalEvent } from '../../domain/naval/types';
import type { NavalSessionSnapshot, NavalSessionView } from './NavalSession';

export interface NavalDebugBridge {
  getSnapshot(): NavalSessionSnapshot;
  consumeNewEvents(afterId: number): NavalEvent[];
  restart(): void;
}

export function createNavalDebugBridge(session: NavalSessionView): NavalDebugBridge {
  return {
    getSnapshot: () => structuredClone(session.getSnapshot()),
    consumeNewEvents: (afterId) => session.consumeNewEvents(afterId),
    restart: () => session.restart(),
  };
}
