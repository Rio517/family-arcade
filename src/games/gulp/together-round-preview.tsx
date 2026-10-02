/**
 * Harness screens for a shared round, on the real 3D stage: the "Waiting for
 * …" note over a round, and the shared results card. together-preview.tsx
 * lists them with the lobby screens.
 *
 * Each round is built the way the table builds one (net/round.ts) from a fixed
 * seed, then played for a while by computer brains in the children's seats,
 * so the city, the sizes and the scores are what a real round reaches. A
 * dropped device is the rules' own dropOut(). Dev-only, like the page that
 * lists these.
 */
import { useCallback, useRef, useState } from 'react';
import { seededRng } from '@shared/rng';
import { KINDS, type PropKind } from './domain/catalog';
import { MAPS } from './domain/city';
import { createBrain } from './domain/rivals';
import { AWAY_WAIT } from './domain/holes';
import { dropOut, levelOf, standings, stepWorld, type World, type WorldEvent } from './domain/world';
import type { RoundSettings, Seat } from './net/protocol';
import { buildRound } from './net/round';
import { GulpHud } from './components/GulpHud';
import { GulpMinimap } from './components/GulpMinimap';
import { GulpStage } from './components/GulpStage';
import { ResultsCard, type RoundResult } from './components/ResultsCard';
import { hudOf } from './components/round';
import { rivalsBesides, SKINS } from './components/skins';
import { addRound, emptyScores, familyTop, sameRound, type ScoreRound } from './storage/scores';

const noop = () => {};
const SEED = 20261002;
const STEP = 0.05;
const SETTINGS: RoundSettings = { map: 'city', difficulty: 'medium', duration: 240, powerups: true, fightBack: true };
/** The city's one wonder, fixed so the round is the same on every load. */
const WONDERS: PropKind[] = ['clocktower'];
/** The children at the table: the host first, then the guests in their seats. */
const CHILDREN: Seat[] = [
  { name: 'Klara', skin: 1, human: true },
  { name: 'Rio', skin: 4, human: true },
  { name: 'Mina', skin: 2, human: true },
  { name: 'Oskar', skin: 3, human: true },
];
/** Where dropped holes sit: offsets from the followed hole, in its radius plus theirs. To the sides on a wide screen, mostly above on a tall one. */
const WIDE_SPOTS: Array<[number, number]> = [[-1.3, 0], [1.3, 0], [0, -1.2]];
const TALL_SPOTS: Array<[number, number]> = [[-0.65, -1.1], [0.65, -1.1], [-0.95, 0.9]];
/** A dropped hole shown here waits this long at most: well inside AWAY_WAIT, so no brain takes it over. */
const AWAY_HELD = AWAY_WAIT / 4;

/** A shared round for `children` seats, played `seconds` in by brains in every seat. */
function playedRound(children: number, seconds: number, settings: RoundSettings = SETTINGS): World {
  const kids = CHILDREN.slice(0, children);
  const rivals = rivalsBesides(
    kids.map((s) => s.skin),
    MAPS[settings.map].rivals + 1 - children,
  ).map((r) => ({ ...r, human: false }));
  const w = buildRound({ seed: SEED, settings, wonders: WONDERS, seats: [...kids, ...rivals] });
  const rng = seededRng(SEED + 1);
  for (let i = 0; i < children; i++) w.brains[i] = createBrain(rng, settings.difficulty);
  for (let t = 0; t < seconds && w.status !== 'over'; t += STEP) stepWorld(w, STEP, null);
  for (let i = 0; i < children; i++) w.brains[i] = null;
  return w;
}

/** One frame of the round, the dropped holes kept waiting (see AWAY_HELD). */
function stepHeld(w: World, away: number[], dt: number) {
  for (const id of away) w.holes[id].away = Math.min(w.holes[id].away ?? 0, AWAY_HELD);
  return stepWorld(w, dt, null);
}

const looksOf = (w: World) => w.holes.map((h) => ({ color: SKINS[h.skin % SKINS.length].color, label: h.name }));

/**
 * The round as one device shows it: the stage following `follow`, the HUD
 * and, while it is played, the mini map. Once it is `over` the HUD stays
 * under the results card, as on the page.
 */
function RoundView({ world, follow, step, notice = null, over = false }: { world: World; follow: number; step: (dt: number) => WorldEvent[]; notice?: string | null; over?: boolean }) {
  const [hud, setHud] = useState(() => hudOf(world, follow));
  const beat = useRef(0);
  const neverPaused = useRef(false);
  const onFrame = useCallback(
    (_: unknown, dt: number) => {
      beat.current += dt;
      if (beat.current < 0.1) return;
      beat.current = 0;
      setHud(hudOf(world, follow));
    },
    [world, follow],
  );
  return (
    <>
      <GulpStage world={world} looks={looksOf(world)} follow={follow} playing pausedRef={neverPaused} onFrame={onFrame} step={step} />
      <GulpHud over={over} hud={hud} banners={[]} muted={false} onMute={noop} onPause={noop} touch={false} notice={notice} />
      {!over && (
        <div className="gulp-minimap-slot">
          <GulpMinimap world={world} />
        </div>
      )}
    </>
  );
}

const still = () => [];

/**
 * A round under way on one device, `seats` children at the table. `away`
 * holes have dropped out and sit beside the one this device follows, so a
 * waiting hole and a playing one are seen together. `frozen` is a guest whose
 * host has gone quiet: nothing moves, as nothing arrives.
 */
export function LiveRound({
  seats,
  follow,
  away = [],
  frozen = false,
  notice = null,
  dress,
}: {
  seats: number;
  follow: number;
  away?: number[];
  frozen?: boolean;
  notice?: string | null;
  /** Changes the played round before it is shown: names and scores for a layout check. */
  dress?: (w: World) => void;
}) {
  const [world] = useState(() => {
    const w = playedRound(seats, 40);
    dress?.(w);
    const me = w.holes[follow];
    const spots = innerWidth > innerHeight ? WIDE_SPOTS : TALL_SPOTS;
    away.forEach((id, i) => {
      const h = w.holes[id];
      const [dx, dz] = spots[i];
      h.x = me.x + dx * (me.r + h.r);
      h.z = me.z + dz * (me.r + h.r);
      dropOut(w, id);
    });
    return w;
  });
  const step = useCallback((dt: number) => stepHeld(world, away, dt), [world, away]);
  return <RoundView world={world} follow={follow} step={frozen ? still : step} notice={notice} />;
}

/** The family's earlier rounds on this map, for the board on the results card. */
const EARLIER: ScoreRound[] = [
  { userId: 'k', name: 'Klara', map: 'city', difficulty: 'medium', score: 5120, level: 9, rank: 1, at: 1 },
  { userId: 'm', name: 'Mina', map: 'city', difficulty: 'medium', score: 3480, level: 8, rank: 2, at: 2 },
  { userId: 'o', name: 'Oskar', map: 'city', difficulty: 'medium', score: 2210, level: 7, rank: 1, at: 3 },
];

/** The results card's numbers for `follow`, worked out as the page's finish() does. */
function resultOf(w: World, follow: number, userId: string): RoundResult {
  const me = w.holes[follow];
  const rank = standings(w).indexOf(me) + 1;
  const { map, difficulty } = w.options;
  const prevBest = Math.max(0, ...EARLIER.filter((r) => r.userId === userId).map((r) => r.score));
  const entry: ScoreRound = { userId, name: me.name, map, difficulty, score: me.score, level: levelOf(me.r), rank, at: 10 };
  const board = familyTop(addRound({ ...emptyScores(), rounds: EARLIER }, entry).rounds, map, difficulty);
  return {
    rank,
    score: me.score,
    level: entry.level,
    kills: me.kills,
    wonders: me.wonders,
    gulped: me.gulped,
    biggest: me.biggest ? KINDS[me.biggest.kind].name : null,
    newBest: me.score > prevBest,
    prevBest,
    entry,
    board,
    place: board.findIndex((r) => sameRound(r, entry)) + 1,
  };
}

/** The host's results at the end of a timed round, with a guest asking for another. */
export function SharedResults() {
  const [world] = useState(() => playedRound(3, 400, { ...SETTINGS, duration: 90 }));
  const [result] = useState(() => resultOf(world, 0, 'k'));
  return (
    <>
      <RoundView world={world} follow={0} step={still} over />
      <ResultsCard world={world} follow={0} result={result} onAgain={noop} onMenu={noop}>
        <p className="gulp-again-note">Mina wants to play again!</p>
      </ResultsCard>
    </>
  );
}

/** A guest's results when the host never came back: the round as it stood, ended on this device. */
export function EndedEarly() {
  const [world] = useState(() => {
    const w = playedRound(2, 50);
    // As the table ends it (see HOST_GONE in net/table.ts).
    w.status = 'over';
    w.endedBy = 'ended';
    return w;
  });
  const [result] = useState(() => resultOf(world, 1, 'r'));
  return (
    <>
      <RoundView world={world} follow={1} step={still} over />
      <ResultsCard world={world} follow={1} result={result} onAgain={noop} onMenu={noop}>
        <p className="gulp-again-note" data-testid="gulp-ended-early">
          Klara&apos;s game stopped, so the round ended early.
        </p>
      </ResultsCard>
    </>
  );
}
