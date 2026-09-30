/**
 * What the child hears and reads when something happens in the round: one
 * table from the world's events to a sound and a banner. Pure, so it can be
 * tested line by line; the page plays and shows what it returns.
 */
import { KINDS, LEVELS } from '../domain/catalog';
import type { World, WorldEvent } from '../domain/world';
import type { Banner } from './round';
import type { Cue } from './sounds';

export interface Feedback {
  cue?: Cue;
  /** How big a sound it is, 0..1 (a gulp is louder for a bigger thing). */
  size?: number;
  banner?: Omit<Banner, 'id'>;
}

/** What has been said already this round, for things said only once. */
export interface Said {
  police: boolean;
}

const INCOMING: Record<'tanker' | 'tank' | 'heli' | 'bomber', Omit<Banner, 'id'>> = {
  tanker: { kind: 'warn', text: 'Look out! A fuel truck!', sub: 'Swerve out of its way' },
  tank: { kind: 'warn', text: 'Tanks are coming!', sub: 'Dodge the red circles, or gulp them!' },
  heli: { kind: 'warn', text: 'Helicopter!', sub: 'Keep moving, dodge the red circles' },
  bomber: { kind: 'warn', text: 'Bombers overhead!', sub: 'Get out of the red circles' },
};

const HURT: Record<'chem' | 'tanker' | 'bomb', Omit<Banner, 'id'>> = {
  chem: { kind: 'hurt', text: 'Yuck! Chemicals!', sub: 'Ouch, a bit smaller' },
  tanker: { kind: 'hurt', text: 'Hot hot hot!', sub: 'The fuel truck burned you' },
  bomb: { kind: 'hurt', text: 'Boom! You shrank', sub: 'Ouch, a bit smaller' },
};

/** The child's hole is always hole 0. */
const ME = 0;

export function feedbackFor(e: WorldEvent, w: World, said: Said): Feedback | null {
  switch (e.type) {
    case 'eat':
      return e.hole === ME ? { cue: 'gulp', size: Math.min(1, KINDS[e.prop.kind].tier / 8) } : null;
    case 'level':
      if (e.hole !== ME) return null;
      return {
        cue: 'level',
        banner: {
          kind: 'level',
          text: `Level ${e.level}!`,
          sub: e.level < LEVELS.length ? `Now you can eat ${LEVELS[e.level].label.toLowerCase()}` : 'Bigger and bigger!',
        },
      };
    case 'news':
      return { cue: 'level', banner: { kind: 'news', text: e.text } };
    case 'police':
      // Once a round is plenty: the cars and officers say the rest.
      if (said.police) return null;
      said.police = true;
      return { cue: 'warn', banner: { kind: 'good', text: 'Nee-naw! Police!' } };
    case 'wonder':
      return e.hole === ME ? { cue: 'win', banner: { kind: 'news', text: `You gulped ${e.name}! +${e.points.toLocaleString()}` } } : null;
    case 'combo':
      return e.hole === ME ? { cue: 'power' } : null;
    case 'power':
      return e.hole === ME ? { cue: 'power', banner: { kind: 'good', text: e.kind === 'speed' ? 'Speed boost!' : 'Double points!' } } : null;
    case 'gulp':
      return e.eater === ME ? { cue: 'gulp', size: 1, banner: { kind: 'good', text: `You swallowed ${w.holes[e.eaten].name}!` } } : null;
    case 'incoming':
      return e.target === ME ? { cue: 'warn', banner: INCOMING[e.kind] } : null;
    case 'hurt':
      return e.hole === ME ? { cue: 'hurt', banner: HURT[e.cause] } : null;
    case 'boom': {
      const me = w.holes[ME];
      return Math.hypot(e.x - me.x, e.z - me.z) < 60 + me.r * 3 ? { cue: 'boom' } : null;
    }
    default:
      return null;
  }
}
