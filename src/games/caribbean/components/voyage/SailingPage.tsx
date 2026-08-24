import { useEffect, useRef, useState } from 'react';

import { RED_JACKDAW_VOYAGE } from '../../content/voyage';
import type { CaribbeanController } from '../../state/useCaribbean';
import '../../styles/voyage.css';
import { VoyageInstrument } from './VoyageInstrument';

export function SailingPage({ controller }: { controller: CaribbeanController }) {
  const state = controller.journal?.state;
  if (state === undefined || state.mode.kind !== 'sailing') {
    throw new Error('SailingPage requires a saved sailing campaign');
  }
  const flagship = state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inFlightRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => { headingRef.current?.focus(); }, []);

  const continueEast = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setStatus('');
    try {
      const outcome = await controller.completeSeaLeg();
      setStatus(outcome.kind === 'applied' ? 'Contact saved.' : 'Course change was not saved.');
    } catch {
      setStatus('Course change failed. Try again.');
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  };

  return (
    <section className="caribbean-voyage caribbean-voyage--sailing" aria-labelledby="caribbean-sailing-title">
      <header className="caribbean-voyage-status-rail">
        <p>Bridgetown departure · day {state.calendar.elapsedDays}</p>
        <strong>{flagship?.name ?? 'Flagship'}</strong>
        <span>{flagship?.cargo.provisions ?? 0} provisions aboard</span>
      </header>
      <VoyageInstrument phase="sailing" />
      <section className="caribbean-voyage-decision">
        <p className="caribbean-voyage-bearing">Saved course · {RED_JACKDAW_VOYAGE.bearingLabel}</p>
        <h1 id="caribbean-sailing-title" ref={headingRef} tabIndex={-1}>East by north from Bridgetown</h1>
        <p>Outbound leg spends 1 day and 1 provision before contact.</p>
        <button
          className="caribbean-voyage-action"
          data-testid="voyage-continue-east"
          type="button"
          disabled={controller.busy || pending}
          onClick={() => void continueEast()}
        >
          Continue east by north
        </button>
        <p data-testid="voyage-status" className="caribbean-voyage-status" role="status" aria-live="polite">{status}</p>
      </section>
    </section>
  );
}
