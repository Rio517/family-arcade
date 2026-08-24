import { SLOOP_CLASS } from '../../content/naval';
import { shipHoldUsed } from '../../domain/economy';
import type { ShipState } from '../../domain/types';

export function ShipyardSummary({ ship }: { ship: ShipState }) {
  return (
    <div className="caribbean-port-stub caribbean-shipyard-summary">
      <p className="caribbean-port-lede">
        <strong>{ship.name}</strong> · Sloop
      </p>
      <dl className="caribbean-port-facts caribbean-port-facts--ship">
        <div><dt>Hull</dt><dd>{ship.hull} / {SLOOP_CLASS.hullMaximum}</dd></div>
        <div><dt>Sails</dt><dd>{ship.sails} / {SLOOP_CLASS.sailsMaximum}</dd></div>
        <div><dt>Crew</dt><dd>{ship.crew}</dd></div>
        <div><dt>Cannon</dt><dd>{ship.cannon} / {SLOOP_CLASS.cannonMaximum}</dd></div>
        <div><dt>Hold</dt><dd>Hold {shipHoldUsed(ship)} / {SLOOP_CLASS.hold}</dd></div>
      </dl>
      <p>Repairs and refits open after a profitable voyage.</p>
    </div>
  );
}
