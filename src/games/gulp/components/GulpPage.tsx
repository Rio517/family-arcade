/**
 * Gulp Universe — the page. The menu sits over a live city with computer holes
 * roaming it; PLAY starts a round in the same place; the round ends on the
 * clock (or from the pause card in an endless round) with a results card.
 *
 * The world lives outside React and changes every frame (see GulpStage).
 * This page copies a snapshot out of it for the scoreboard a few times a
 * second, turns what happened into sounds and banners, and records the round
 * on the ticket that played it and in the family's scores (see scores.ts).
 */
import '../styles/gulp.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { recordResultFor } from '@shared/profile/results';
import { useProfile } from '@shared/profile/useProfile';
import { SpeakerIcon, SpeakerOffIcon, TrophyIcon } from '@shared/ui/icons';
import { KINDS } from '../domain/catalog';
import { MAPS, type MapId } from '../domain/city';
import { createWorld, endRound, levelOf, standings, type World, type WorldEvent } from '../domain/world';
import type { HoleLook } from '../three/scene';
import { feedbackFor, type Said } from './feedback';
import { GulpHud } from './GulpHud';
import { GulpMenu } from './GulpMenu';
import { GulpMinimap } from './GulpMinimap';
import { GulpStage } from './GulpStage';
import { DIFFICULTY_TITLE, durationOf, hudOf, loadScene, type Banner, type Hud, type SceneLoader, type Settings } from './round';
import { FamilyBoard } from './ScoresDialog';
import {
  BOARD_SIZE,
  addRound,
  adoptLegacyBests,
  bestOf,
  familyTop,
  loadLegacyBests,
  loadScores,
  sameRound,
  saveScores,
  type ScoreRound,
} from '../storage/scores';
import { dealRoundWonders, loadSettings, saveSettings } from '../storage/settings';
import { SKINS, rivalsFor } from './skins';
import { Sounds } from './sounds';

/** The registry id — the `game` on a credited history row. */
const GAME_ID = 'gulp';
/** What the results card says about the family board. */
function familyLine(place: number, score: number, board: ScoreRound[]): string {
  if (place === 1) return 'New family record!';
  if (place > 1) return `You're #${place} in the family!`;
  if (score <= 0) return 'Gulp something to join the board!';
  const need = board[board.length - 1].score - score + 1;
  return `${need.toLocaleString()} more to join the board!`;
}

interface Round {
  world: World;
  key: number;
  looks: HoleLook[];
  follow: number;
  playing: boolean;
}

type Phase = 'menu' | 'play' | 'over';

/**
 * The menu's backdrop: always the Region map with every wonder, the airport,
 * stadiums and the countryside, whatever map is picked, so the menu shows off
 * what the bigger maps hold. Only computer holes roam it.
 */
const SHOWCASE: MapId = 'region';

function attract(key: number, rng: () => number): Round {
  const map = SHOWCASE;
  const rivals = rivalsFor(-1, MAPS[map].rivals);
  const world = createWorld(rng, null, rivals, { map, duration: 0, powerups: false, fightBack: false });
  return { world, key, looks: rivals.map((r) => ({ color: SKINS[r.skin].color, label: r.name })), follow: 0, playing: false };
}

interface GulpPageProps {
  /** Where the randomness comes from; a test hands in a seeded one (ADR 0005). */
  rng?: () => number;
  /** Builds the 3D scene; a test hands in a fake. */
  load?: SceneLoader;
}

export function GulpPage({ rng = Math.random, load = loadScene }: GulpPageProps) {
  const { userId, profile } = useProfile();
  // The name from the arcade's "who's playing" screen, as in the racer.
  const myName = profile.name.trim() || 'You';
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [phase, setPhase] = useState<Phase>('menu');
  const [round, setRound] = useState<Round>(() => attract(0, rng));
  const [hud, setHud] = useState<Hud | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [paused, setPaused] = useState(false);
  const [storedScores, setStoredScores] = useState(loadScores);
  const [legacyBests] = useState(loadLegacyBests);
  const [result, setResult] = useState<{
    rank: number;
    score: number;
    level: number;
    kills: number;
    wonders: number;
    newBest: boolean;
    /** The best before this round (0 if none), shown beside a new best. */
    prevBest: number;
    gulped: number;
    /** What the biggest thing swallowed was, in words. */
    biggest: string | null;
    /** This round as kept in the scores, and the family board it was played for. */
    entry: ScoreRound;
    board: ScoreRound[];
    /** Its place on that board, 0 when it did not make it. */
    place: number;
  } | null>(null);
  const pausedRef = useRef(false);
  const soundsRef = useRef<Sounds | null>(null);
  const beatRef = useRef(0);
  const bannerId = useRef(0);
  const lastCount = useRef(0);
  /** Things said once a round (see feedback.ts). */
  const said = useRef<Said>({ police: false, combo: false });
  /** Set once a round's result is written, so it is written once. */
  const doneRef = useRef(false);
  const [touch] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    soundsRef.current = new Sounds();
    return () => soundsRef.current?.dispose();
  }, []);

  useEffect(() => {
    saveSettings(settings);
    if (soundsRef.current) soundsRef.current.muted = settings.muted;
  }, [settings]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const level = settings.difficulty ?? 'easy';
  const player = userId ?? 'guest';
  // The signed-in player's bests from before rounds were kept join the scores
  // under their name; saved with the next round they finish.
  const scores = useMemo(() => adoptLegacyBests(storedScores, legacyBests, player, myName), [storedScores, legacyBests, player, myName]);

  const changeSettings = (next: Settings) => setSettings(next);

  const say = useCallback((b: Omit<Banner, 'id'>) => {
    const id = ++bannerId.current;
    setBanners((list) => [...list.slice(-2), { ...b, id }]);
    // News lingers, and a warning stays up while the danger is on its way.
    window.setTimeout(() => setBanners((list) => list.filter((x) => x.id !== id)), b.kind === 'news' ? 5000 : b.kind === 'warn' ? 4000 : 2400);
  }, []);

  const play = () => {
    soundsRef.current?.unlock();
    const s = settings;
    const rivals = rivalsFor(s.skin, MAPS[s.map].rivals);
    const world = createWorld(rng, { name: myName, skin: s.skin }, rivals, {
      map: s.map,
      duration: durationOf(s),
      powerups: s.powerups,
      fightBack: s.fightBack,
      regrow: s.regrow,
      difficulty: s.difficulty,
      wonders: dealRoundWonders(s.map, rng),
    });
    const looks: HoleLook[] = [
      { color: SKINS[s.skin].color, label: myName },
      ...rivals.map((r) => ({ color: SKINS[r.skin].color, label: r.name })),
    ];
    setRound((r) => ({ world, key: r.key + 1, looks, follow: 0, playing: true }));
    setHud(hudOf(world, 0));
    setBanners([]);
    setResult(null);
    setPaused(false);
    lastCount.current = 0;
    said.current = { police: false, combo: false };
    doneRef.current = false;
    setPhase('play');
  };

  const toMenu = () => {
    setPaused(false);
    setResult(null);
    setHud(null);
    setPhase('menu');
    setRound((r) => attract(r.key + 1, rng));
  };

  const finish = useCallback(
    (w: World) => {
      if (doneRef.current) return;
      doneRef.current = true;
      const order = standings(w);
      const me = w.holes[0];
      const rank = order.indexOf(me) + 1;
      const map = w.options.map;
      const difficulty = w.options.difficulty;
      const now = Date.now();
      const prevBest = bestOf(scores.rounds, player, map, difficulty);
      const newBest = me.score > prevBest;
      const entry: ScoreRound = { userId: player, name: myName, map, difficulty, score: me.score, level: levelOf(me.r), rank, at: now };
      const next = addRound(scores, entry);
      saveScores(next);
      setStoredScores(next);
      const board = familyTop(next.rounds, map, difficulty);
      const place = board.findIndex((r) => sameRound(r, entry)) + 1;
      setResult({
        rank,
        score: me.score,
        level: entry.level,
        kills: me.kills,
        wonders: me.wonders,
        gulped: me.gulped,
        biggest: me.biggest ? KINDS[me.biggest.kind].name : null,
        newBest,
        prevBest,
        entry,
        board,
        place,
      });
      setPhase('over');
      soundsRef.current?.play(rank === 1 ? 'win' : 'level');
      // The computer holes count as opponents, like Ship Battle's captains.
      recordResultFor(userId, {
        won: rank === 1,
        survivingCells: 0,
        code: GAME_ID,
        game: GAME_ID,
        opponent: 'Computer holes',
        finishedAt: now,
      });
    },
    [scores, player, myName, userId],
  );

  const onFrame = useCallback(
    (events: WorldEvent[], dt: number) => {
      const w = round.world;
      if (!round.playing) return;
      const sounds = soundsRef.current;
      for (const e of events) {
        const f = feedbackFor(e, w, said.current);
        if (f?.cue) sounds?.play(f.cue, f.size);
        if (f?.banner) say(f.banner);
      }
      // Countdown beeps.
      const count = w.status === 'countdown' ? Math.ceil(w.countdown) : 0;
      if (count !== lastCount.current) {
        if (count > 0) sounds?.play('tick');
        else if (lastCount.current > 0) sounds?.play('go');
        lastCount.current = count;
      }
      // Ten HUD updates a second: a re-render on every frame something is
      // eaten (nearly every frame for a big hole) costs frames for nothing.
      beatRef.current += dt;
      if (beatRef.current > 0.1) {
        beatRef.current = 0;
        setHud(hudOf(w, 0));
      }
      if (w.status === 'over') finish(w);
    },
    [round, say, finish],
  );

  // Development only: the live world on `window`, so a browser check can jump
  // straight to a giant hole or an attack. Stripped from the production build.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __gulp?: World }).__gulp = round.world;
  }, [round]);

  // Escape pauses a round and resumes it.
  useEffect(() => {
    if (phase !== 'play') return;
    const key = (e: KeyboardEvent) => {
      // Escape or the space bar pauses and resumes.
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [phase]);
  useDismissOnEscape(phase === 'over', toMenu);

  const muted = settings.muted;
  const toggleMute = () => setSettings((s) => ({ ...s, muted: !s.muted }));

  return (
    <div className="gulp-root" data-testid="gulp-page">
      <GulpStage
        key={round.key}
        world={round.world}
        looks={round.looks}
        follow={round.follow}
        playing={round.playing}
        pausedRef={pausedRef}
        onFrame={onFrame}
        load={load}
      />

      {phase === 'menu' && (
        <>
          <div className="gulp-corner left">
            <Link className="gulp-round" to="/" aria-label="Back to the arcade" data-testid="gulp-back">
              <span aria-hidden="true">‹</span>
            </Link>
          </div>
          <div className="gulp-corner right">
            <button type="button" className="gulp-round" onClick={toggleMute} aria-label={muted ? 'Sound on' : 'Sound off'}>
              {muted ? <SpeakerOffIcon size={22} /> : <SpeakerIcon size={22} />}
            </button>
            <FullscreenButton />
          </div>
          <GulpMenu
            settings={settings}
            onChange={changeSettings}
            onPlay={play}
            best={bestOf(scores.rounds, player, settings.map, level)}
            rounds={scores.rounds}
            userId={player}
          />
        </>
      )}

      {phase !== 'menu' && hud && (
        <GulpHud over={phase === 'over'} hud={hud} banners={banners} muted={muted} onMute={toggleMute} onPause={() => setPaused(true)} touch={touch} />
      )}
      {phase === 'play' && (
        <div className="gulp-minimap-slot">
          <GulpMinimap world={round.world} />
        </div>
      )}

      {paused && phase === 'play' && (
        <div className="gulp-modal-backdrop">
          <div className="gulp-modal" role="dialog" aria-modal="true" aria-label="Paused" data-testid="gulp-paused">
            <h2>Paused</h2>
            <button type="button" className="gulp-play small" onClick={() => setPaused(false)} data-testid="gulp-resume">
              Keep going
            </button>
            {round.world.options.duration === 0 && (
              <button
                type="button"
                className="gulp-button"
                onClick={() => {
                  endRound(round.world);
                  setPaused(false);
                }}
                data-testid="gulp-end"
              >
                End round
              </button>
            )}
            <button type="button" className="gulp-button" onClick={play} data-testid="gulp-restart">
              Start again
            </button>
            <button type="button" className="gulp-button ghost" onClick={toMenu} data-testid="gulp-menu-btn">
              Menu
            </button>
          </div>
        </div>
      )}

      {phase === 'over' && result && (
        <div className="gulp-modal-backdrop">
          <div className="gulp-modal results" role="dialog" aria-modal="true" aria-label="Results" data-testid="gulp-results">
            <span className="gulp-kicker">{round.world.options.duration > 0 ? "Time's up!" : 'Round over'}</span>
            <h2>{result.rank === 1 ? 'You are the biggest hole!' : `#${result.rank} — great gulping!`}</h2>
            <div className="gulp-results-body">
              <section className="gulp-results-round" aria-label="This round">
                <ol className="gulp-results-list">
                  {standings(round.world).map((h, i) => (
                    <li key={h.id} className={h.isPlayer ? 'me' : ''}>
                      <span className="gulp-rank">{i + 1}</span>
                      <span className="gulp-dot" style={{ background: SKINS[h.skin % SKINS.length].css }} aria-hidden="true" />
                      <span className="gulp-name">{h.name}</span>
                      <small>LV {levelOf(h.r)}</small>
                      <b>{h.score.toLocaleString()}</b>
                    </li>
                  ))}
                </ol>
                {result.newBest && (
                  <p className="gulp-newbest" data-testid="gulp-newbest">
                    <b>New best!</b>
                    {result.prevBest > 0 && <span>was {result.prevBest.toLocaleString()}</span>}
                  </p>
                )}
                <p className="gulp-stats">
                  Level {result.level} · {result.gulped.toLocaleString()} {result.gulped === 1 ? 'thing' : 'things'} gulped
                  {result.kills > 0 && ` · ${result.kills} ${result.kills === 1 ? 'hole' : 'holes'} swallowed`}
                  {result.wonders > 0 && ` · ${result.wonders} ${result.wonders === 1 ? 'wonder' : 'wonders'}`}
                  {result.biggest && (
                    <>
                      <br />
                      Biggest bite: <b>{result.biggest}</b>
                    </>
                  )}
                </p>
              </section>
              <section className="gulp-results-family" aria-labelledby="gulp-family-title" data-testid="gulp-results-family">
                <h3 className="gulp-family-head" id="gulp-family-title">
                  <TrophyIcon size={20} />
                  Family top {BOARD_SIZE}
                  <small>
                    {MAPS[result.entry.map].label} · {DIFFICULTY_TITLE[result.entry.difficulty]}
                  </small>
                </h3>
                <p className={`gulp-family-place${result.place > 0 ? ' made' : ''}`} data-testid="gulp-family-place">
                  {familyLine(result.place, result.score, result.board)}
                </p>
                {result.board.length > 0 && <FamilyBoard rows={result.board} highlight={result.entry} testId="gulp-results-board" />}
              </section>
            </div>
            <div className="gulp-modal-row">
              <button type="button" className="gulp-play small" onClick={play} data-testid="gulp-again">
                Play again
              </button>
              <button type="button" className="gulp-button ghost" onClick={toMenu} data-testid="gulp-results-menu">
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
