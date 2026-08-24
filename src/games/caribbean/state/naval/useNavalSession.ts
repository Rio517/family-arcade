import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { NavalBattleInput } from '../../domain/naval/types';
import { NavalSession, type NavalSessionView } from './NavalSession';

export function useNavalSession(input: NavalBattleInput): NavalSessionView {
  const session = useMemo(() => new NavalSession(input), [input]);

  useEffect(() => {
    session.start();
    return () => session.dispose();
  }, [session]);

  const snapshot = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    session.getSnapshot,
    session.getSnapshot,
  );

  return useMemo(() => ({
    ...snapshot,
    setRudder: (value) => session.setRudder(value),
    setSail: (value) => session.setSail(value),
    setAmmunition: (value) => session.setAmmunition(value),
    requestFire: (side) => session.requestFire(side),
    setPaused: (value) => session.setPaused(value),
    togglePause: () => session.togglePause(),
    restart: () => session.restart(),
    subscribe: (listener) => session.subscribe(listener),
    getSnapshot: session.getSnapshot,
    consumeNewEvents: (afterId) => session.consumeNewEvents(afterId),
  }), [session, snapshot]);
}
