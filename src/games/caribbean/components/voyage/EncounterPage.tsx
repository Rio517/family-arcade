import { useEffect, useRef, useState } from 'react';

import type { CaribbeanController } from '../../state/useCaribbean';
import '../../styles/voyage.css';
import { VoyageInstrument } from './VoyageInstrument';

type EncounterChoice = 'avoid' | 'pursue';

export function EncounterPage({ controller }: { controller: CaribbeanController }) {
  const state = controller.journal?.state;
  if (state === undefined || state.mode.kind !== 'encounter') {
    throw new Error('EncounterPage requires a saved encounter campaign');
  }
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inFlightRef = useRef(false);
  const [pending, setPending] = useState<EncounterChoice | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => { headingRef.current?.focus(); }, []);

  const choose = async (choice: EncounterChoice) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(choice);
    setStatus('');
    try {
      const outcome = choice === 'avoid'
        ? await controller.avoidEncounter()
        : await controller.engageEncounter();
      setStatus(outcome.kind === 'applied'
        ? choice === 'avoid' ? 'Return to Bridgetown saved.' : 'Engagement saved.'
        : choice === 'avoid' ? 'Return was not saved.' : 'Pursuit was not saved.');
    } catch {
      setStatus(choice === 'avoid' ? 'Return failed. Try again.' : 'Pursuit failed. Try again.');
    } finally {
      inFlightRef.current = false;
      setPending(null);
    }
  };

  const disabled = controller.busy || pending !== null;
  return (
    <section className="caribbean-voyage caribbean-voyage--encounter" aria-labelledby="caribbean-encounter-title">
      <header className="caribbean-voyage-status-rail">
        <p>Red Jackdaw contact · day {state.calendar.elapsedDays}</p>
        <strong>Decision required</strong>
      </header>
      <VoyageInstrument phase="encounter" />
      <section className="caribbean-voyage-decision">
        <p className="caribbean-voyage-bearing">Contact report · east by north</p>
        <h1 id="caribbean-encounter-title" ref={headingRef} tabIndex={-1}>Red Jackdaw sighted</h1>
        <p>Avoid and return spends the guaranteed 1 day and 1 provision and keeps the Red Jackdaw lead active.</p>
        <p>Pursue enters a two-to-four-minute naval duel using the saved contact.</p>
        <div className="caribbean-voyage-actions">
          <button className="caribbean-voyage-action" data-testid="encounter-avoid" type="button" disabled={disabled} onClick={() => void choose('avoid')}>Avoid and return</button>
          <button className="caribbean-voyage-action" data-testid="encounter-pursue" type="button" disabled={disabled} onClick={() => void choose('pursue')}>Pursue Red Jackdaw</button>
        </div>
        <p data-testid="voyage-status" className="caribbean-voyage-status" role="status" aria-live="polite">{status}</p>
      </section>
    </section>
  );
}
