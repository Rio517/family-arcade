import '../styles/risk.css';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RiskBoard } from './RiskBoard';
import { useMapZoom } from './useMapZoom';
import { useRisk } from '../state/useRisk';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { MAPS } from '../maps/registry';
import { currentPlayer, hasUnclaimed, type NewPlayer } from '../domain/rules';
import { clearRiskGame, loadRiskGame, type StoredRisk } from '../storage/riskPersistence';
// Persona metadata only — the bot BRAIN stays behind the dynamic import in
// useRisk, so human-only campaigns never download it.
import { personaById, RISK_PERSONAS } from '../domain/bots/personas';
import { BotIcon, PersonIcon, ResumeIcon } from '@shared/ui/icons';
import type { BattleResult, DiceMode, GameState } from '../domain/types';

// Heraldic tinctures — a general's banner. Kept bright enough that the dark
// border lines read against them, and the six stay easy to tell apart.
const PLAYER_COLORS = ['#cf3a30', '#3f78bd', '#4f9c60', '#d69a34', '#9b5aa6', '#2fa199'];
const PLAYER_NAMES = ['Crimson', 'Cobalt', 'Forest', 'Amber', 'Plum', 'Teal'];

const PHASE_NAMES: Record<string, string> = {
  setup: 'Setting up',
  reinforce: 'Placing armies',
  attack: 'Attacking',
  fortify: 'Moving armies',
};

/** "just now", "25 minutes ago", "3 hours ago", "2 days ago". */
function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function RiskPage() {
  const navigate = useNavigate();
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(PLAYER_NAMES.slice());
  // Persona id per seat, or null for a human chair.
  const [seats, setSeats] = useState<(string | null)[]>(Array(6).fill(null));
  const [diceMode, setDiceMode] = useState<DiceMode>('random');

  const risk = useRisk();
  const { map, state, sel, dest, moveCount, battle, targets } = risk;
  // An unfinished campaign saved on this device, offered on the setup screen.
  const [resumable, setResumable] = useState<StoredRisk | null>(() => loadRiskGame());

  // Forty-two territories on a phone is a lot of very small taps, so the map
  // zooms. The hook has to run before the setup/victory early returns below —
  // rules of hooks — hence the placeholder extent until a map is chosen.
  const zoom = useMapZoom(map?.width ?? 1000, map?.height ?? 500);
  const resetZoom = zoom.reset;
  useEffect(() => {
    // A newly built map may have a different extent than the placeholder above.
    resetZoom();
  }, [map, resetZoom]);

  function resume() {
    if (!resumable) return;
    if (!risk.resume(resumable)) setResumable(null);
  }

  function start() {
    const players: NewPlayer[] = Array.from({ length: count }, (_, i) => {
      const persona = seats[i];
      return persona
        ? { name: personaById(persona).name, color: PLAYER_COLORS[i], bot: persona }
        : { name: names[i]?.trim() || PLAYER_NAMES[i], color: PLAYER_COLORS[i] };
    });
    risk.start({ mapId: MAPS[0].id, players, diceMode });
  }

  const goMenu = () => navigate('/');

  // ── Setup: muster the generals ────────────────────────────────────────────
  if (!state || !map) {
    return (
      <Shell onMenu={goMenu}>
        <div className="narrow-col stack">
          {resumable && (
            <div className="risk-resume" data-testid="risk-resume">
              <button className="risk-resume-main" onClick={resume} data-testid="risk-resume-btn">
                <span className="risk-resume-icon"><ResumeIcon size={24} /></span>
                <span className="risk-resume-text">
                  <span className="risk-eyebrow">Unfinished campaign</span>
                  <strong>
                    Resume — {resumable.state.players.length} generals · {PHASE_NAMES[resumable.state.phase] ?? 'In progress'}
                  </strong>
                  <span className="risk-resume-sub">
                    {resumable.state.players[resumable.state.current]?.name} to move · saved {timeAgo(resumable.savedAt)}
                  </span>
                </span>
                <span className="risk-resume-chev" aria-hidden="true">›</span>
              </button>
              <button
                className="risk-btn ghost risk-resume-discard"
                onClick={() => { clearRiskGame(); setResumable(null); }}
                data-testid="risk-resume-discard"
                aria-label="Abandon the saved campaign"
              >
                Abandon
              </button>
            </div>
          )}

          <div className="panel">
            <div className="risk-eyebrow">The war council</div>
            <h2>Gather your generals</h2>
            <div className="risk-count">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} className={`risk-choice ${count === n ? 'on' : ''}`} onClick={() => setCount(n)} data-testid={`count-${n}`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="stack" style={{ marginTop: 14 }}>
              {Array.from({ length: count }, (_, i) => (
                <div className="risk-player-row" key={i}>
                  <span className="risk-seal" style={{ ['--pc' as string]: PLAYER_COLORS[i] }} />
                  {seats[i] === null ? (
                    <input
                      value={names[i] ?? ''}
                      maxLength={16}
                      placeholder={PLAYER_NAMES[i]}
                      onChange={(e) => {
                        const next = names.slice();
                        next[i] = e.target.value;
                        setNames(next);
                      }}
                      data-testid={`name-${i}`}
                    />
                  ) : (
                    <div className="risk-personas" role="radiogroup" aria-label={`Computer general for seat ${i + 1}`}>
                      {RISK_PERSONAS.map((p) => (
                        <button
                          key={p.id}
                          className={`risk-choice risk-persona ${seats[i] === p.id ? 'on' : ''}`}
                          role="radio"
                          aria-checked={seats[i] === p.id}
                          title={p.tagline}
                          onClick={() => {
                            const next = seats.slice();
                            next[i] = p.id;
                            setSeats(next);
                          }}
                          data-testid={`persona-${i}-${p.id}`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className={`risk-choice risk-seat-kind ${seats[i] !== null ? 'on' : ''}`}
                    aria-pressed={seats[i] !== null}
                    aria-label={
                      seats[i] === null
                        ? `Seat ${i + 1}: a person — tap for a computer general`
                        : `Seat ${i + 1}: a computer general — tap for a person`
                    }
                    onClick={() => {
                      const next = seats.slice();
                      next[i] = next[i] === null ? RISK_PERSONAS[0].id : null;
                      setSeats(next);
                    }}
                    data-testid={`seat-bot-${i}`}
                  >
                    {seats[i] === null ? <PersonIcon size={18} /> : <BotIcon size={18} />}
                  </button>
                </div>
              ))}
            </div>
            <p className="risk-note" style={{ marginTop: 10 }}>
              Tap the little figure to seat a computer general — pick a gentler or
              fiercer one for each chair.
            </p>
          </div>

          <div className="panel">
            <div className="risk-eyebrow">Fortunes of war</div>
            <div className="risk-count">
              <button
                className={`risk-choice ${diceMode === 'random' ? 'on' : ''}`}
                onClick={() => setDiceMode('random')}
                data-testid="dice-random"
              >
                Wild dice
              </button>
              <button
                className={`risk-choice ${diceMode === 'balanced' ? 'on' : ''}`}
                onClick={() => setDiceMode('balanced')}
                data-testid="dice-balanced"
              >
                Balanced dice
              </button>
            </div>
            <p className="risk-note" style={{ marginTop: 10 }}>
              {diceMode === 'random'
                ? 'Every roll is pure, independent luck — glorious upsets and cruel streaks alike.'
                : 'Dice are drawn from a fair bag, so luck evens out — results stay close to the true odds, with no long cruel streaks.'}
            </p>
          </div>

          <button className="risk-btn primary block lg" onClick={start} data-testid="risk-start">Take the field</button>
        </div>
      </Shell>
    );
  }

  // ── Victory ───────────────────────────────────────────────────────────────
  if (state.phase === 'over' && state.winner !== null) {
    const w = state.players[state.winner];
    return (
      <Shell onMenu={goMenu}>
        <div className="narrow-col stack">
          <div className="risk-victory">
            <WinEmblem color={w.color} />
            <div className="risk-eyebrow">Dispatch from the front</div>
            <h2 className="risk-victory-title">{w.name} holds the world</h2>
            <p className="risk-victory-sub">Every banner on the map is theirs. A decisive campaign, General.</p>
          </div>
          <button className="risk-btn primary block lg" onClick={risk.newCampaign} data-testid="risk-again">New campaign</button>
          <button className="risk-btn block" onClick={goMenu}>← Back to menu</button>
        </div>
      </Shell>
    );
  }

  // ── The campaign ──────────────────────────────────────────────────────────
  const me = currentPlayer(state);
  const claiming = state.phase === 'setup' && hasUnclaimed(state);
  const freeLands = claiming
    ? Object.values(state.territories).filter((t) => t.owner === -1).length
    : 0;
  // The plaque says one simple thing: whose turn, and what they're doing.
  // "Mario attacks" — a seven-year-old shouldn't have to decode "mustering".
  const doing =
    claiming ? 'picks a land' :
    state.phase === 'setup' || state.phase === 'reinforce' ? 'places armies' :
    state.phase === 'attack' ? 'attacks' : 'moves armies';
  // The count is the answer to the question the player is actually asking, so
  // it gets its own quieter line — only while there's a count to give.
  const plaqueSub =
    claiming ? `${freeLands} lands free` :
    state.phase === 'setup' ? `${state.toPlace} left` :
    state.phase === 'reinforce'
      ? (state.toPlace > 0 ? `${state.toPlace} left` : 'All placed — press Done ✓')
      : null;

  // A capture stays open until the general decides how many armies march in.
  const conquest = state.phase === 'attack' && !me.bot ? state.lastConquest ?? null : null;
  const conquestSpare = conquest ? state.territories[conquest.from].armies - 1 : 0;

  // One plain-language sentence, always in the same place, telling you the one
  // thing to do next. It replaces the old per-phase paragraphs, which moved
  // around and pushed the buttons with them.
  const hint =
    claiming ? 'Tap any pale (unclaimed) land to claim it — one army raises your flag.' :
    state.phase === 'setup' ? `Tap one of your lands to add an army — ${state.toPlace} left. Play passes on automatically.` :
    state.phase === 'reinforce'
      ? (state.toPlace > 0
          ? `Tap your lands to place ${state.toPlace} more.`
          : 'Every army placed — press Done to begin the attack.')
    : state.phase === 'attack'
      ? (conquest && conquestSpare > 0
          ? 'Land taken! Choose how many armies move into it.'
          : sel
            ? 'Tap a neighbouring enemy land to attack it — or press Done when you’re finished.'
            : 'Tap one of your lands with 2 or more armies, then a touching enemy land.')
    : (sel && dest
        ? 'Choose how many to move, then confirm.'
        : 'Optional: tap a land, then a connected land of yours to move armies — or press Done.');

  return (
    <Shell onMenu={goMenu} bare>
      {/* The map IS the screen: it fills the stage and every control floats over
          it, at a fixed size and place. The stage wears the active general's
          colour, and the plaque re-pops on every hand-off so whose turn it is
          can't be missed — especially during the alternating deploy. */}
      <div className="risk-stage" style={{ ['--pc' as string]: me.color }} data-testid="risk-stage">
        <RiskBoard map={map} state={state} selected={sel} targets={targets} onPick={risk.pick} zoom={zoom} />

        {/* A warm low sun over the whole theatre. It multiplies into the
            parchment rather than covering it, so the map's own ink, graticule
            and compass all still read through. */}
        <div className="risk-sunset" aria-hidden="true" />

        <div className="risk-zoomctl">
          <button onClick={zoom.zoomIn} disabled={!zoom.canZoomIn} aria-label="Zoom in" data-testid="risk-zoom-in">+</button>
          <button onClick={zoom.zoomOut} disabled={!zoom.canZoomOut} aria-label="Zoom out" data-testid="risk-zoom-out">−</button>
          <button onClick={zoom.reset} disabled={zoom.isDefault} aria-label="Show the whole map" data-testid="risk-zoom-reset">⤢</button>
        </div>

        {/* The plaque wears the active general's colour — since the ring around
            the stage is gone, this plate IS the turn indicator. */}
        <div className="risk-plaque" key={`${state.current}-${state.phase === 'setup' ? 's' : 'p'}`}>
          <span className="risk-plaque-name" data-testid="risk-turn">
            <strong>{me.name}</strong> {doing}
          </span>
          {plaqueSub && <span className="risk-plaque-sub" data-testid="risk-phase">{plaqueSub}</span>}
        </div>

        <CommandRail state={state} />

        <p className="risk-hintline">{hint}</p>

        <div className="risk-warbar">
          <PhaseSteps state={state} claiming={claiming} />

          {state.phase === 'reinforce' && (
            <button
              className="risk-done"
              disabled={state.toPlace > 0}
              onClick={risk.doneReinforce}
              data-testid="end-reinforce"
            >
              Done ✓
            </button>
          )}
          {state.phase === 'attack' && (
            <button className="risk-done" onClick={risk.doneAttack} data-testid="end-attack">
              Done ✓
            </button>
          )}
          {state.phase === 'fortify' && (
            <button className="risk-done" onClick={risk.doneTurn} data-testid="end-turn">
              Done ✓
            </button>
          )}

          <span className="risk-warbar-gap" />
          {state.phase === 'attack' && battle && <DiceRow battle={battle} />}
        </div>

        {/* A fresh conquest: choose how many armies follow the dice in. Same
            panel as the fortify slider — the one control that appears mid-turn. */}
        {conquest && conquestSpare > 0 && (
          <AdvancePanel
            key={`${conquest.from}-${conquest.to}`}
            max={conquestSpare}
            landName={map.territories.find((t) => t.id === conquest.to)?.name ?? 'the new land'}
            onMove={risk.advance}
          />
        )}

        {/* The march slider is the one control that has to appear mid-turn, so
            it gets its own panel above the bar instead of resizing it. */}
        {state.phase === 'fortify' && sel && dest && (
          <div className="risk-march">
            <input
              type="range"
              min={1}
              max={state.territories[sel].armies - 1}
              value={moveCount}
              onChange={(e) => risk.setMoveCount(Number(e.target.value))}
              data-testid="fortify-range"
              aria-label="Armies to move"
            />
            <div className="risk-march-actions">
              <button className="risk-btn primary" onClick={risk.confirmFortify} data-testid="fortify-confirm">
                Move {moveCount} →
              </button>
              <button className="risk-btn" onClick={risk.cancelSelection}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

// Plain words on the stepper — "Reinforce" and "Fortify" are jargon a
// seven-year-old shouldn't have to decode.
const TURN_STEPS: { phase: string; label: string }[] = [
  { phase: 'reinforce', label: 'Place' },
  { phase: 'attack', label: 'Attack' },
  { phase: 'fortify', label: 'Move' },
];

/**
 * After a capture: how many extra armies march into the new land? Local state,
 * keyed on the conquest by the caller, so each capture starts the slider at
 * "everyone forward" — the choice kids nearly always want.
 */
function AdvancePanel({ max, landName, onMove }: { max: number; landName: string; onMove: (n: number) => void }) {
  const [count, setCount] = useState(max);
  return (
    <div className="risk-march" data-testid="advance-panel">
      <span className="risk-march-label">Move more armies into {landName}?</span>
      <input
        type="range"
        min={0}
        max={max}
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        data-testid="advance-range"
        aria-label={`Extra armies to move into ${landName}`}
      />
      <div className="risk-march-actions">
        <button className="risk-btn primary" onClick={() => onMove(count)} data-testid="advance-confirm">
          Move {count} →
        </button>
        <button className="risk-btn" onClick={() => onMove(0)} data-testid="advance-stay">
          Leave them
        </button>
      </div>
    </div>
  );
}

/**
 * The three steps of a turn, always visible at a fixed width: the lit one is
 * where you are, the ones behind you dim. Claiming and deploying happen before
 * the cycle starts, so they show as a single step of their own.
 */
function PhaseSteps({ state, claiming }: { state: GameState; claiming: boolean }) {
  if (state.phase === 'setup') {
    return (
      <span className="risk-steps">
        <span className="risk-step on">{claiming ? 'Claim' : 'Deploy'}</span>
      </span>
    );
  }
  const at = TURN_STEPS.findIndex((s) => s.phase === state.phase);
  return (
    <span className="risk-steps">
      {TURN_STEPS.map((s, i) => (
        <span key={s.phase} className={`risk-step ${i === at ? 'on' : i < at ? 'done' : ''}`}>
          {s.label}
        </span>
      ))}
    </span>
  );
}

/**
 * Every general's strength down the right-hand side. Risk turns on knowing who
 * is getting dangerous, and until now the board showed you only your own count
 * — you had to survey the map by eye to find out you were losing.
 */
function CommandRail({ state }: { state: GameState }) {
  const standings = state.players.map((p, i) => {
    let lands = 0;
    let armies = 0;
    for (const t of Object.values(state.territories)) {
      if (t.owner === i) {
        lands++;
        armies += t.armies;
      }
    }
    return { name: p.name, color: p.color, lands, armies, index: i };
  });
  return (
    <div className="risk-rail" data-testid="risk-rail">
      {standings.map((s) => (
        <span
          key={s.index}
          className={`risk-gen ${s.index === state.current ? 'active' : ''} ${s.lands === 0 ? 'out' : ''}`}
          style={{ ['--pc' as string]: s.color }}
        >
          <span className="risk-gen-coin" />
          <span className="risk-gen-nums">
            <b>{s.name}</b>
            {s.lands === 0 ? (
              <span>Out of the war</span>
            ) : (
              // The units are their own elements so a phone can drop them and
              // still show the two numbers that matter: "39 · 14".
              <span>
                {s.armies}<span className="risk-gen-unit"> armies</span>
                <span className="risk-gen-sep"> · </span>
                {s.lands}<span className="risk-gen-unit"> lands</span>
              </span>
            )}
          </span>
        </span>
      ))}
    </div>
  );
}

const HELP_SEEN_KEY = 'risk-help-seen-v1';

function Shell({
  children,
  onMenu,
  bare = false,
}: {
  children: React.ReactNode;
  onMenu: () => void;
  /** Campaign mode: no title row, no footer — the map gets the whole window. */
  bare?: boolean;
}) {
  const [showHelp, setShowHelp] = useState(false);

  // Pop the rules open the very first time someone opens Risk, so a new player
  // (or a kid) learns the game before staring at a map they don't understand.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(HELP_SEEN_KEY) === '1';
    } catch {
      /* private mode / storage blocked — just don't auto-open */
      seen = true;
    }
    if (!seen) {
      setShowHelp(true);
      try {
        localStorage.setItem(HELP_SEEN_KEY, '1');
      } catch { /* ignore */ }
    }
  }, []);

  return (
    <div className={`app risk-theme ${bare ? 'risk-bare' : ''}`}>
      {bare ? (
        // Mid-campaign the title row is pure overhead — it costs a whole band
        // of screen to tell you which game you already know you're playing. The
        // three things it carried become icons floating over the map instead.
        <>
          <button className="risk-icon risk-exit" onClick={onMenu} aria-label="Back to the menu" data-testid="risk-back">
            ‹
          </button>
          <div className="risk-quickbar">
            <button
              className="risk-icon"
              onClick={() => setShowHelp(true)}
              aria-label="How to play"
              data-testid="risk-help-open"
            >
              ?
            </button>
            <FullscreenButton />
          </div>
        </>
      ) : (
        <div className="topbar risk-topbar">
          <button className="risk-btn ghost" onClick={onMenu} data-testid="risk-back">‹ Menu</button>
          <h1>Risk</h1>
          <span className="risk-topbar-rule" aria-hidden="true" />
          <button className="risk-btn ghost" onClick={() => setShowHelp(true)} data-testid="risk-help-open">
            How to play
          </button>
          <FullscreenButton />
        </div>
      )}
      {children}
      {!bare && <div className="footer"><Link to="/">Family game console</Link></div>}
      {showHelp && <RiskHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

/** A friendly, kid-readable rules card, themed as a field manual. */
function RiskHelp({ onClose }: { onClose: () => void }) {
  useDismissOnEscape(true, onClose);
  const steps: { n: number; name: string; body: string }[] = [
    { n: 1, name: 'Place armies', body: 'You get fresh armies at the start of your turn — more if you hold whole continents (the +numbers on the map). Tap your own lands to place them.' },
    { n: 2, name: 'Attack', body: 'Tap one of your lands that has 2 or more armies, then tap a touching enemy land. Dice decide the battle — the defender wins ties. Win, and the land becomes yours. Attack as often as you like, or not at all.' },
    { n: 3, name: 'Move armies', body: 'Once per turn you may move armies between two of your connected lands. Then press Done to pass to the next general.' },
  ];
  return (
    /* Backdrop click is a mouse convenience; Escape (above) and the "Got it"
       button are the keyboard path. */
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
    <div className="risk-help-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="risk-help" role="dialog" aria-label="How to play Risk" aria-modal="true">
        <div className="risk-eyebrow">The field manual</div>
        <h2 className="risk-help-title">How to play Risk</h2>
        <p className="risk-help-goal">
          <strong>Goal:</strong> conquer the world. Be the last general with any lands left on the map.
        </p>
        <p className="risk-help-sub">
          <strong>To start,</strong> you take turns <em>claiming</em> free lands — one army raises
          your flag — until the whole map is taken. Then you take turns placing the rest of your
          starting armies on your own lands. After that, play begins — every turn has three steps,
          in order:
        </p>
        <ol className="risk-help-steps">
          {steps.map((s) => (
            <li key={s.n} className="risk-help-step">
              <span className="risk-help-num">{s.n}</span>
              <span>
                <strong>{s.name}</strong>
                <span className="risk-help-body">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="risk-help-tip">
          Your lands are the ones washed in <strong>your banner’s colour</strong>. The plaque at the top
          always shows whose turn it is and which step they’re on.
        </p>
        <button className="risk-btn primary block lg" onClick={onClose} data-testid="risk-help-close">
          Got it — take the field
        </button>
      </div>
    </div>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function Die({ v, side }: { v: number; side: 'att' | 'def' }) {
  return (
    <span className={`risk-die ${side}`}>
      <svg viewBox="0 0 30 30" aria-hidden="true">
        {(PIPS[v] ?? []).map(([c, r], i) => <circle key={i} cx={7 + c * 8} cy={7 + r * 8} r={2.7} />)}
      </svg>
    </span>
  );
}

function DiceRow({ battle }: { battle: BattleResult }) {
  return (
    <div className="risk-dice" data-testid="dice-row">
      <div className="risk-dice-side">
        <span className="risk-eyebrow">Attack</span>
        <span className="risk-dice-row">{battle.attackerDice.map((d, i) => <Die key={i} v={d} side="att" />)}</span>
      </div>
      <div className="risk-dice-side">
        <span className="risk-eyebrow">Defend</span>
        <span className="risk-dice-row">{battle.defenderDice.map((d, i) => <Die key={i} v={d} side="def" />)}</span>
      </div>
      <div className="risk-dice-outcome">
        {battle.captured ? 'Territory taken' : `−${battle.attackerLosses} yours · −${battle.defenderLosses} theirs`}
      </div>
    </div>
  );
}

/** A laurel-crowned wax seal in the victor's colour. */
function WinEmblem({ color }: { color: string }) {
  return (
    <svg className="risk-win-emblem" viewBox="0 0 120 120" aria-hidden="true" style={{ ['--pc' as string]: color }}>
      {/* Two laurel branches sweeping up the left and right of the seal (open at
          the top for the crown). Angle 180° is the bottom; each branch climbs
          one side. Leaves are tilted along the branch so they read as foliage. */}
      <g className="rw-laurel">
        {Array.from({ length: 7 }, (_, i) => {
          const a = 178 + i * 11; // bottom → up the left side
          return <ellipse key={`l${i}`} cx={60} cy={18} rx={5.5} ry={2.6} transform={`rotate(${a} 60 60) rotate(35 60 18)`} />;
        })}
        {Array.from({ length: 7 }, (_, i) => {
          const a = 182 - i * 11; // bottom → up the right side
          return <ellipse key={`r${i}`} cx={60} cy={18} rx={5.5} ry={2.6} transform={`rotate(${a} 60 60) rotate(-35 60 18)`} />;
        })}
      </g>
      <circle cx={60} cy={62} r={30} className="rw-ring-outer" />
      <circle cx={60} cy={62} r={25} className="rw-seal" />
      {/* crown */}
      <path className="rw-crown" d="M44 44 L48 30 L54 40 L60 26 L66 40 L72 30 L76 44 Z" />
    </svg>
  );
}
