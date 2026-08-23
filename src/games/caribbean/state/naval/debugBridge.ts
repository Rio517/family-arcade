import type { NavalEvent } from '../../domain/naval/types';
import { broadsideMuzzleOrigin, broadsideVector } from '../../domain/naval/geometry';
import type { Broadside, Point } from '../../domain/naval/types';
import type { NavalSessionSnapshot, NavalSessionView } from './NavalSession';

export interface NavalVolleyEvidence {
  eventId: number;
  side: Broadside;
  vector: Point;
  muzzleOrigin: Point;
}

export interface NavalDebugBridge {
  getSnapshot(): NavalSessionSnapshot;
  consumeNewEvents(afterId: number): NavalEvent[];
  getVolleyEvidence(afterId: number): NavalVolleyEvidence[];
  restart(): void;
}

export function createNavalDebugBridge(session: NavalSessionView): NavalDebugBridge {
  return {
    getSnapshot: () => structuredClone(session.getSnapshot()),
    consumeNewEvents: (afterId) => session.consumeNewEvents(afterId),
    getVolleyEvidence: (afterId) => {
      const snapshot = session.getSnapshot();
      return session.consumeNewEvents(afterId)
        .filter((event): event is Extract<NavalEvent, { kind: 'volley' }> => (
          event.kind === 'volley' && event.shipId === 'player'
        ))
        .map((event) => {
          const ship = snapshot.state.ships[event.shipId];
          return {
            eventId: event.id,
            side: event.result.side,
            vector: broadsideVector(ship.heading, event.result.side),
            muzzleOrigin: broadsideMuzzleOrigin(ship.position, ship.heading, event.result.side),
          };
        });
    },
    restart: () => session.restart(),
  };
}
