/**
 * Gulp Universe — the page. The menu sits over a live city with computer holes
 * roaming it; PLAY starts a round in the same place; the round ends on the
 * clock (or from the pause card in an endless round) with a results card.
 *
 * The world lives outside React and changes every frame (see GulpStage).
 * This page copies a snapshot out of it for the scoreboard a few times a
 * second, turns what happened into sounds and banners, and records the round
 * on the ticket that played it.
 */
import '../styles/gulp.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { recordResultFor } from '@shared/profile/results';
import { useProfile } from '@shared/profile/useProfile';
import { SpeakerIcon, SpeakerOffIcon } from '@shared/ui/icons';
import { KINDS, type PropKind } from '../domain/catalog';
import { MAPS, WONDER_COUNT, type MapId } from '../domain/city';
import { dealWonders } from '../domain/wonders';
import { createWorld, endRound, levelOf, standings, type World, type WorldEvent } from '../domain/world';
import type { HoleLook } from '../three/scene';
import { GulpHud } from './GulpHud';
import { GulpMenu } from './GulpMenu';
import { GulpMinimap } from './GulpMinimap';
import { GulpStage } from './GulpStage';
import { durationOf, hudOf, loadScene, unlockedAt, type Banner, type Hud, type SceneLoader, type Settings } from './round';
import { SKINS, rivalsFor } from './skins';
import { Sounds } from './sounds';

/** The registry id — the `game` on a credited history row. */
const GAME_ID = 'gulp';
const SETTINGS_KEY = 'gulp:settings:v1';
const BEST_KEY = 'gulp:best:v1';
const DECK_KEY = 'gulp:wonder-deck:v1';

/** Deal this round's wonders from the deck kept between rounds (see domain/wonders.ts). */
function dealRoundWonders(map: MapId, rng: () => number): PropKind[] {
  let deck: PropKind[] = [];
  try {
    deck = JSON.parse(localStorage.getItem(DECK_KEY) ?? '[]') as PropKind[];
  } catch {
    /* no deck yet */
  }
  const { dealt, deck: rest } = dealWonders(deck, WONDER_COUNT[map], rng);
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(rest));
  } catch {
    /* not saved: a fresh shuffle next time */
  }
  return dealt;
}

const DEFAULT_SETTINGS: Settings = {
  map: 'city',
  length: 'short',
  powerups: true,
  fightBack: false,
  regrow: true,
  skin: 0,
  muted: false,
  difficulty: 'easy',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* private mode or bad data: defaults */
  }
  return DEFAULT_SETTINGS;
}

function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
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
  const { userId } = useProfile();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [phase, setPhase] = useState<Phase>('menu');
  const [round, setRound] = useState<Round>(() => attract(0, rng));
  const [hud, setHud] = useState<Hud | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [paused, setPaused] = useState(false);
  const [best, setBest] = useState<Record<string, number>>(loadBest);
  const [result, setResult] = useState<{
    rank: number;
    score: number;
    level: number;
    kills: number;
    wonders: number;
    newBest: boolean;
  } | null>(null);
  const pausedRef = useRef(false);
  const soundsRef = useRef<Sounds | null>(null);
  const beatRef = useRef(0);
  const bannerId = useRef(0);
  const lastCount = useRef(0);
  /** Set once a round's result is written, so it is written once. */
  const doneRef = useRef(false);
  const [touch] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    soundsRef.current = new Sounds();
    return () => soundsRef.current?.dispose();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* not saved: fine */
    }
    if (soundsRef.current) soundsRef.current.muted = settings.muted;
  }, [settings]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Easy keeps the key bests were saved under before there were levels.
  const level = settings.difficulty ?? 'easy';
  const bestKey = `${userId ?? 'guest'}:${settings.map}${level === 'easy' ? '' : `:${level}`}`;

  const changeSettings = (next: Settings) => setSettings(next);

  const say = useCallback((b: Omit<Banner, 'id'>) => {
    const id = ++bannerId.current;
    setBanners((list) => [...list.slice(-2), { ...b, id }]);
    window.setTimeout(() => setBanners((list) => list.filter((x) => x.id !== id)), b.kind === 'news' ? 5000 : 2400);
  }, []);

  const play = () => {
    soundsRef.current?.unlock();
    const s = settings;
    const rivals = rivalsFor(s.skin, MAPS[s.map].rivals);
    const world = createWorld(rng, { name: 'You', skin: s.skin }, rivals, {
      map: s.map,
      duration: durationOf(s),
      powerups: s.powerups,
      fightBack: s.fightBack,
      regrow: s.regrow,
      difficulty: s.difficulty,
      wonders: dealRoundWonders(s.map, rng),
    });
    const looks: HoleLook[] = [
      { color: SKINS[s.skin].color, label: 'You' },
      ...rivals.map((r) => ({ color: SKINS[r.skin].color, label: r.name })),
    ];
    setRound((r) => ({ world, key: r.key + 1, looks, follow: 0, playing: true }));
    setHud(hudOf(world, 0));
    setBanners([]);
    setResult(null);
    setPaused(false);
    lastCount.current = 0;
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
      const prev = best[bestKey] ?? 0;
      const newBest = me.score > prev;
      if (newBest) {
        const next = { ...best, [bestKey]: me.score };
        setBest(next);
        try {
          localStorage.setItem(BEST_KEY, JSON.stringify(next));
        } catch {
          /* not saved: fine */
        }
      }
      setResult({ rank, score: me.score, level: levelOf(me.r), kills: me.kills, wonders: me.wonders, newBest });
      setPhase('over');
      soundsRef.current?.play(rank === 1 ? 'win' : 'level');
      // The computer holes count as opponents, like Ship Battle's captains.
      recordResultFor(userId, {
        won: rank === 1,
        survivingCells: 0,
        code: GAME_ID,
        game: GAME_ID,
        opponent: 'Computer holes',
        finishedAt: Date.now(),
      });
    },
    [best, bestKey, userId],
  );

  const onFrame = useCallback(
    (events: WorldEvent[], dt: number) => {
      const w = round.world;
      if (!round.playing) return;
      const sounds = soundsRef.current;
      for (const e of events) {
        switch (e.type) {
          case 'eat':
            if (e.hole === 0) sounds?.play('gulp', Math.min(1, KINDS[e.prop.kind].tier / 8));
            break;
          case 'level':
            if (e.hole === 0) {
              sounds?.play('level');
              say({ kind: 'level', text: `Level ${e.level}!`, sub: e.level < 11 ? `Now you can eat ${unlockedAt(e.level).toLowerCase()}` : 'Bigger and bigger!' });
            }
            break;
          case 'news':
            sounds?.play('level');
            say({ kind: 'news', text: e.text });
            break;
          case 'police':
            sounds?.play('warn');
            say({ kind: 'level', text: 'Nee-naw! The police are coming!', sub: 'They just want to take a look' });
            break;
          case 'wonder':
            if (e.hole === 0) {
              sounds?.play('win');
              say({ kind: 'news', text: `You gulped ${e.name}! +${e.points.toLocaleString()}` });
            }
            break;
          case 'combo':
            if (e.hole === 0) sounds?.play('power');
            break;
          case 'power':
            if (e.hole === 0) {
              sounds?.play('power');
              say({ kind: 'good', text: e.kind === 'speed' ? 'Speed boost!' : 'Double points!' });
            }
            break;
          case 'gulp':
            if (e.eater === 0) {
              sounds?.play('gulp', 1);
              say({ kind: 'good', text: `You swallowed ${w.holes[e.eaten].name}!` });
            }
            break;
          case 'incoming':
            if (e.target === 0) {
              sounds?.play('warn');
              say(
                e.kind === 'tanker'
                  ? { kind: 'warn', text: 'Look out! A fuel truck!', sub: 'Swerve out of its way' }
                  : e.kind === 'tank'
                    ? { kind: 'warn', text: 'Tanks are coming!', sub: 'Dodge the red circles, or gulp them!' }
                    : e.kind === 'heli'
                      ? { kind: 'warn', text: 'Helicopter!', sub: 'Keep moving, dodge the red circles' }
                      : { kind: 'warn', text: 'Bombers overhead!', sub: 'Get out of the red circles' },
              );
            }
            break;
          case 'hurt':
            if (e.hole === 0) {
              sounds?.play('hurt');
              say({ kind: 'hurt', text: e.cause === 'chem' ? 'Yuck! Chemicals!' : e.cause === 'tanker' ? 'Hot hot hot!' : 'Boom! You shrank', sub: e.cause === 'tanker' ? 'The fuel truck burned you' : 'Ouch, a bit smaller' });
            }
            break;
          case 'boom': {
            const me = w.holes[0];
            if (Math.hypot(e.x - me.x, e.z - me.z) < 60 + me.r * 3) sounds?.play('boom');
            break;
          }
        }
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
          <GulpMenu settings={settings} onChange={changeSettings} onPlay={play} best={best[bestKey] ?? 0} />
        </>
      )}

      {phase !== 'menu' && hud && (
        <GulpHud hud={hud} banners={banners} muted={muted} onMute={toggleMute} onPause={() => setPaused(true)} touch={touch} />
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
            <ol className="gulp-results-list">
              {standings(round.world).map((h, i) => (
                <li key={h.id} className={h.isPlayer ? 'me' : ''}>
                  <span className="gulp-rank">{i + 1}</span>
                  <span className="gulp-dot" style={{ background: SKINS[h.skin % SKINS.length].css }} aria-hidden="true" />
                  <span className="gulp-name">{h.isPlayer ? 'You' : h.name}</span>
                  <small>LV {levelOf(h.r)}</small>
                  <b>{h.score.toLocaleString()}</b>
                </li>
              ))}
            </ol>
            <p className="gulp-stats">
              Level {result.level} · {result.kills} {result.kills === 1 ? 'hole' : 'holes'} swallowed
              {result.wonders > 0 && ` · ${result.wonders} ${result.wonders === 1 ? 'wonder' : 'wonders'}`}
              {result.newBest && <em className="gulp-newbest"> · New best!</em>}
            </p>
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
