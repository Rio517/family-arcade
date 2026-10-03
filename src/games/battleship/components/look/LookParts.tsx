/**
 * The pieces the darker-arcade looks add to the start screens: a title on
 * the lobby, the 1P/2P tag on each door, and the Fleet → Place → Battle
 * steps. Each look draws them its own way in styles/looks.css; the markup is
 * shared. Shown only while a look is under review (`look` is a, b or c) —
 * today's screens never render them.
 */
import '../../styles/looks.css';
import type { ArcadeLook } from './arcadeLook';
import { PixelText } from './PixelText';

/**
 * The lobby's title. `compact` is the slim band over the captain ladder and
 * the join form, where the screen is needed for choosing.
 */
export function LookHero({ look, compact = false }: { look: ArcadeLook; compact?: boolean }) {
  const cls = `lk-hero lk-hero-${look} ${compact ? 'compact' : ''}`;
  if (look === 'a') {
    return (
      <section className={cls} data-testid="look-hero">
        <div className="lk-a-scope" aria-hidden="true">
          <span className="lk-a-ring" />
          <span className="lk-a-ring" />
          <span className="lk-a-ring" />
          <span className="lk-a-sweep" />
          <span className="lk-a-blip lk-a-blip-1" />
          <span className="lk-a-blip lk-a-blip-2" />
          <span className="lk-a-blip lk-a-blip-3" />
        </div>
        <div className="lk-a-copy">
          <p className="lk-a-kicker">Sonar arcade · night ops</p>
          <PixelText text="Ship Battle" height={compact ? 30 : 56} className="lk-a-logo" />
          {!compact && <p className="lk-a-tag">Find their fleet in the dark. Sink it before they sink yours.</p>}
          {!compact && (
            <p className="lk-a-start" aria-hidden="true">
              <span className="lk-a-blink">Press start</span>
              <span className="lk-a-players"> · 1 or 2 players</span>
            </p>
          )}
        </div>
      </section>
    );
  }
  if (look === 'b') {
    return (
      <section className={cls} data-testid="look-hero">
        <div className="lk-b-sign">
          <span className="lk-b-chain left" aria-hidden="true" />
          <span className="lk-b-chain right" aria-hidden="true" />
          <div className="lk-b-board">
            <span className="lk-b-bulbs top" aria-hidden="true" />
            <span className="lk-b-bulbs bottom" aria-hidden="true" />
            <p className="lk-b-kicker">The night harbour arcade</p>
            <p className="lk-b-neon" aria-hidden="true">
              Ship Battle
            </p>
            {!compact && <p className="lk-b-line2">Aim · Fire · Sink</p>}
          </div>
        </div>
        {!compact && (
          <div className="lk-b-water" aria-hidden="true">
            <span className="lk-b-neon lk-b-reflect">Ship Battle</span>
          </div>
        )}
        {!compact && (
          <p className="lk-b-coin" aria-hidden="true">
            Insert coin · press start
          </p>
        )}
      </section>
    );
  }
  return (
    <section className={cls} data-testid="look-hero">
      <span className="lk-c-hazard" aria-hidden="true" />
      <div className="lk-c-plate">
        <span className="lk-c-beacon left" aria-hidden="true" />
        <span className="lk-c-beacon right" aria-hidden="true" />
        <p className="lk-c-kicker">Battle stations · all hands</p>
        <p className="lk-c-title" aria-hidden="true">
          Ship Battle
        </p>
        {!compact && (
          <p className="lk-c-coin" aria-hidden="true">
            <span className="lk-c-slot" />
            Insert coin to fire
          </p>
        )}
      </div>
      <span className="lk-c-hazard" aria-hidden="true" />
    </section>
  );
}

/** The 1P / 2P tag on a lobby door: the coin-op way of saying who it's for. */
export function DoorTag({ players }: { players: 1 | 2 }) {
  return (
    <span className="lk-door-tag" aria-hidden="true">
      <span className="lk-door-tag-n">{players}P</span>
      <span className="lk-door-tag-w">Admit {players === 2 ? 'two' : 'one'}</span>
    </span>
  );
}

const STEPS = [
  { id: 'fleet', label: 'Fleet' },
  { id: 'place', label: 'Place' },
  { id: 'battle', label: 'Battle' },
] as const;

/** Where the captain is in getting ready: pick a fleet, place it, battle. */
export function LookSteps({ at }: { at: 'fleet' | 'place' }) {
  const here = STEPS.findIndex((s) => s.id === at);
  return (
    <ol className="lk-steps" aria-label="Getting ready" data-testid="look-steps">
      {STEPS.map((s, i) => (
        <li
          key={s.id}
          className="lk-step"
          data-state={i < here ? 'done' : i === here ? 'current' : 'next'}
          aria-current={i === here ? 'step' : undefined}
        >
          <span className="lk-step-n">{i + 1}</span>
          <span className="lk-step-t">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
