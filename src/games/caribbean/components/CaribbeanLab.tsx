import { useEffect, useRef, useState } from 'react';
import { RadarIcon, ShipIcon, TargetIcon } from '@shared/ui/icons';

import { BATTLE_LAB_INPUT } from '../content/naval';
import type { NavalBattleInput } from '../domain/naval/types';
import type { NavalSessionView } from '../state/naval/NavalSession';
import { useNavalSession } from '../state/naval/useNavalSession';
import { NavalBattlePage, type NavalSceneFactory } from './battle/NavalBattlePage';
import { BattleShortcutLegend } from './battle/BattleShortcutLegend';
import '../styles/caribbean.css';
import '../styles/battle.css';

export interface CaribbeanLabProps {
  sceneFactory?: NavalSceneFactory | null;
  battleInput?: NavalBattleInput;
  onSessionReady?(session: NavalSessionView): void;
}

type LabPhase = 'decision' | 'briefing' | 'battle';

const MIN_PLAYFIELD_WIDTH = 960;
const MIN_PLAYFIELD_HEIGHT = 600;

function supportsBattlePlayfield(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= MIN_PLAYFIELD_WIDTH && window.innerHeight >= MIN_PLAYFIELD_HEIGHT;
}

function useBattlePlayfieldSupport(): boolean {
  const [supported, setSupported] = useState(supportsBattlePlayfield);
  useEffect(() => {
    const update = () => setSupported(supportsBattlePlayfield());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return supported;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6" /></svg>;
}

function BearingThesis() {
  return (
    <div className="caribbean-bearing-thesis" aria-hidden="true">
      <svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid meet">
        <circle cx="320" cy="150" r="116" />
        <path className="caribbean-bearing-thesis__ticks" d="M320 20v28M320 252v28M190 150h28M422 150h28" />
        <line className="caribbean-bearing-thesis__line" x1="205" y1="210" x2="435" y2="90" />
        <path className="caribbean-bearing-thesis__wind" d="m325 48 22 31-14-3-6 13-2-41Z" />
        <path className="caribbean-bearing-thesis__ship" d="m205 187 14 21-8 26-12 5-12-5-8-26 14-21 12 0Z" />
        <path className="caribbean-bearing-thesis__ship caribbean-bearing-thesis__ship--target" d="m435 66 14 21-8 26-12 5-12-5-8-26 14-21 12 0Z" />
      </svg>
      <span className="caribbean-bearing-thesis__label caribbean-bearing-thesis__label--player">Mistral / 210°</span>
      <span className="caribbean-bearing-thesis__label caribbean-bearing-thesis__label--target">Red Jackdaw / 030°</span>
      <strong>72.0</strong>
      <small>Initial range</small>
    </div>
  );
}

function BattleSession({ sceneFactory, battleInput = BATTLE_LAB_INPUT, onSessionReady }: CaribbeanLabProps) {
  const session = useNavalSession(battleInput);
  const deliveredSession = useRef(false);

  useEffect(() => {
    if (!onSessionReady || deliveredSession.current) return;
    deliveredSession.current = true;
    onSessionReady(session);
  }, [onSessionReady, session]);

  return <NavalBattlePage session={session} sceneFactory={sceneFactory} />;
}

export function CaribbeanLab({ sceneFactory, battleInput, onSessionReady }: CaribbeanLabProps) {
  const [phase, setPhase] = useState<LabPhase>('decision');
  const briefingHeading = useRef<HTMLHeadingElement>(null);
  const supportsPlayfield = useBattlePlayfieldSupport();

  useEffect(() => {
    if (phase === 'briefing') briefingHeading.current?.focus();
  }, [phase]);

  if (!supportsPlayfield) {
    return (
      <section className="caribbean-display-notice" data-testid="caribbean-display-notice" role="alert">
        <ShipIcon size={34} />
        <p>Caribbean Career</p>
        <h1>Designed for tablet and larger</h1>
        <span>This sea needs a 960 × 600 playfield. Rotate your device or use a larger display to take command. Any duel restarts when the playfield returns.</span>
      </section>
    );
  }

  if (phase === 'battle') {
    return <BattleSession sceneFactory={sceneFactory} battleInput={battleInput} onSessionReady={onSessionReady} />;
  }

  return (
    <section className="caribbean-lab">
      <header className="caribbean-lab__masthead">
        <div><span>Caribbean / 1702</span><h1>Caribbean Career</h1></div>
        <p><i aria-hidden="true" /> Ready for sea</p>
      </header>

      {phase === 'decision' ? (
        <div className="caribbean-decision">
          <div className="caribbean-decision__instrument">
            <p className="caribbean-eyebrow"><RadarIcon size={18} /> Live naval proving ground</p>
            <h2>Read the wind.<br />Take the prize.</h2>
            <p>One deterministic sloop duel. Learn the broadside, disable Red Jackdaw, and bring her alongside.</p>
            <BearingThesis />
          </div>

          <div className="caribbean-decision__choices" aria-label="Available Caribbean career activities">
            <button
              type="button"
              className="caribbean-lab-action naval-hit-target"
              data-testid="lab-start-naval"
              onClick={() => setPhase('briefing')}
            >
              <span><ShipIcon size={24} /> Active exercise</span>
              <strong>Enter Battle Lab</strong>
              <small>Single-player sloop duel / 2–4 minutes</small>
              <i><ArrowIcon /></i>
            </button>
            <div className="caribbean-next-slice" aria-disabled="true">
              <span>Port decisions are the next slice</span>
              <strong>Bridgetown, markets, and crew</strong>
              <small>The harbour opens after the naval proving ground.</small>
            </div>
            <BattleShortcutLegend />
          </div>
        </div>
      ) : (
        <div className="caribbean-briefing" data-testid="naval-briefing">
          <div className="caribbean-briefing__route"><BearingThesis /></div>
          <div className="caribbean-briefing__copy">
            <p className="caribbean-eyebrow"><TargetIcon size={18} /> Red Jackdaw briefing</p>
            <h2 ref={briefingHeading} tabIndex={-1}>Disable. Close. Capture.</h2>
            <p>Objective: capture the Red Jackdaw. The fresh trade wind comes from 60°. Full sail gives speed; reefed sail turns harder. Steer with A/D and fire port/starboard with Q/E. Round shot breaks hull, chain cuts sails, and grape weakens crew. Disable sails and crew, then close under seven lengths to board.</p>
            <dl>
              <div><dt>Your sloop</dt><dd>Mistral / 8 cannon / 52 crew</dd></div>
              <div><dt>Prize target</dt><dd>Red Jackdaw / capture intact</dd></div>
            </dl>
            <BattleShortcutLegend />
            <button
              type="button"
              className="caribbean-enter-battle naval-hit-target"
              data-testid="naval-enter-battle"
              onClick={() => setPhase('battle')}
            >Enter battle <ArrowIcon /></button>
          </div>
        </div>
      )}
    </section>
  );
}
