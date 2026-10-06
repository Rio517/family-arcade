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
  combo: boolean;
}

const INCOMING: Record<'tanker' | 'tank' | 'heli' | 'bomber', Omit<Banner, 'id'>> = {
  tanker: { kind: 'warn', text: 'Fuel truck!', sub: 'Swerve out of its way.' },
  tank: { kind: 'warn', text: 'Tanks incoming!', sub: 'Dodge the red circles, or gulp them.' },
  heli: { kind: 'warn', text: 'Helicopter!', sub: 'Keep moving. Dodge the red circles.' },
  bomber: { kind: 'warn', text: 'Bombers overhead!', sub: 'Get out of the red circles.' },
};

/** When the city goes after a computer hole, the child hears about it too. */
const AFTER: Record<'tanker' | 'tank' | 'heli' | 'bomber', string> = {
  tanker: 'A fuel truck is after',
  tank: 'Tanks are after',
  heli: 'A helicopter is after',
  bomber: 'Bombers are after',
};

const HURT: Record<'chem' | 'tanker' | 'bomb', Omit<Banner, 'id'>> = {
  chem: { kind: 'hurt', text: 'Chemicals!', sub: 'You shrank a bit.' },
  tanker: { kind: 'hurt', text: 'Fuel burn!', sub: 'The fuel truck burned you.' },
  bomb: { kind: 'hurt', text: 'Bomb hit!', sub: 'You shrank a bit.' },
};

/**
 * What `e` means for the child on this device, whose hole is `me`: hole 0
 * for a solo round and for the host of a shared one, the seat it was given
 * for a guest.
 */
export function feedbackFor(e: WorldEvent, w: World, said: Said, me = 0): Feedback | null {
  switch (e.type) {
    case 'eat':
      return e.hole === me ? { cue: 'gulp', size: Math.min(1, KINDS[e.prop.kind].tier / 8) } : null;
    case 'level':
      if (e.hole !== me) return null;
      return {
        cue: 'level',
        banner: {
          kind: 'level',
          text: `Level ${e.level}!`,
          sub: e.level < LEVELS.length ? `Now you can eat ${LEVELS[e.level].label.toLowerCase()}` : 'You are as big as it gets.',
        },
      };
    case 'news':
      return { cue: 'level', banner: { kind: 'news', text: e.text } };
    case 'police':
      // Once a round is plenty: the cars and officers say the rest.
      if (said.police) return null;
      said.police = true;
      return { cue: 'warn', banner: { kind: 'good', text: 'Police!' } };
    case 'wonder':
      return e.hole === me ? { cue: 'win', banner: { kind: 'news', text: `You gulped ${e.name}! +${e.points.toLocaleString()}` } } : null;
    case 'combo':
      if (e.hole !== me) return null;
      // The first step up in a round says what the multiplier is; after that the sound is enough.
      if (said.combo) return { cue: 'power' };
      said.combo = true;
      return { cue: 'power', banner: { kind: 'good', text: `Points x${e.mult}`, sub: 'Gulp fast to keep it going.' } };
    case 'power':
      return e.hole === me ? { cue: 'power', banner: { kind: 'good', text: e.kind === 'speed' ? 'Speed boost!' : 'Double points!' } } : null;
    case 'gulp':
      return e.eater === me ? { cue: 'gulp', size: 1, banner: { kind: 'good', text: `You swallowed ${w.holes[e.eaten].name}!`, points: e.points } } : null;
    case 'out':
      // The child's own last life ends the round (the results say so); a computer hole's is news.
      return e.hole === me ? null : { banner: { kind: 'news', text: `${w.holes[e.hole].name} is out of lives!` } };
    case 'incoming':
      if (e.target === me) return { cue: 'warn', banner: INCOMING[e.kind] };
      return { banner: { kind: 'news', text: `${AFTER[e.kind]} ${w.holes[e.target].name}!` } };
    case 'hurt':
      return e.hole === me ? { cue: 'hurt', banner: HURT[e.cause] } : null;
    case 'boom': {
      const mine = w.holes[me];
      return Math.hypot(e.x - mine.x, e.z - mine.z) < 60 + mine.r * 3 ? { cue: 'boom' } : null;
    }
    default:
      return null;
  }
}
