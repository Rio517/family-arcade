import { useEffect, useRef, useState } from 'react';

import type { CaribbeanController } from '../../state/useCaribbean';
import '../../styles/voyage.css';
import { CaribbeanMap } from '../map/CaribbeanMap';

type EncounterChoice = 'avoid' | 'pursue';

export function EncounterPage({ controller }: { controller: CaribbeanController }) {
  const state = controller.journal?.state;
  if (state === undefined || state.mode.kind !== 'encounter') {
    throw new Error('EncounterPage requires a saved encounter campaign');
  }
  const flagship = state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
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
      <div className="caribbean-encounter-layout">
        <CaribbeanMap playerName={flagship?.name ?? 'Flagship'} contactVisible />
        <aside className="caribbean-encounter-decision">
          <p className="caribbean-voyage-bearing">Contact report</p>
          <h1 id="caribbean-encounter-title" ref={headingRef} tabIndex={-1}><span>Red Jackdaw</span> sighted</h1>
          <dl className="caribbean-encounter-facts">
            <div data-testid="encounter-bearing"><dt>Bearing</dt><dd>East by north</dd></div>
            <div data-testid="encounter-wind"><dt>Wind</dt><dd>Fresh trade wind from ENE</dd></div>
            <div><dt>Passage</dt><dd>1 day · 1 provision</dd></div>
          </dl>
          <div className="caribbean-voyage-actions">
            <article className="caribbean-voyage-choice caribbean-voyage-choice--pursue" aria-labelledby="encounter-pursue-title">
              <button data-testid="encounter-pursue" type="button" disabled={disabled} onClick={() => void choose('pursue')}>
                <HelmIcon />
                <span className="caribbean-voyage-choice__copy">
                  <h2 id="encounter-pursue-title">Pursue Red Jackdaw</h2>
                  <strong>Enter naval battle</strong>
                  <span>Risk damage and casualties, but retain the prize if victorious.</span>
                </span>
              </button>
            </article>
            <article className="caribbean-voyage-choice caribbean-voyage-choice--avoid" aria-labelledby="encounter-avoid-title">
              <button data-testid="encounter-avoid" type="button" disabled={disabled} onClick={() => void choose('avoid')}>
                <AnchorIcon />
                <span className="caribbean-voyage-choice__copy">
                  <h2 id="encounter-avoid-title">Avoid and return</h2>
                  <strong>Spend 1 day + 1 provision</strong>
                  <span>Return to Bridgetown without combat. This keeps the Red Jackdaw lead active.</span>
                </span>
              </button>
            </article>
          </div>
          <p data-testid="voyage-status" className="caribbean-voyage-status" role="status" aria-live="polite">{status}</p>
        </aside>
      </div>
    </section>
  );
}

function HelmIcon() {
  return (
    <svg className="caribbean-voyage-choice__icon" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="16" /><circle cx="32" cy="32" r="5" />
      <path d="M32 4v12M32 48v12M4 32h12M48 32h12M12 12l9 9M43 43l9 9M52 12l-9 9M21 43l-9 9" />
    </svg>
  );
}

function AnchorIcon() {
  return (
    <svg className="caribbean-voyage-choice__icon" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="13" r="6" /><path d="M32 19v31M22 27h20M9 39c3 12 11 18 23 18s20-6 23-18M9 39l9 4M55 39l-9 4" />
    </svg>
  );
}
