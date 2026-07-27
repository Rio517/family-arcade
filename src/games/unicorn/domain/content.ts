/**
 * The cast of Klara's Magic Coin game: the two worlds and their characters.
 *
 * Kept apart from the engine because it is pure *content* — swap a face or add
 * a character here and nothing about the physics changes. Each character either
 * moves on its own (a fairy has wings, a mermaid has a tail) or rides a magic
 * animal (a princess can't fly, so she rides a unicorn).
 */

import type { World } from './engine';

export interface Character {
  id: string;
  name: string;
  /** The character's face. */
  emoji: string;
  /** The animal this character rides. Absent means it moves on its own. */
  mount?: string;
  /** Flavor line shown on the pick screen. */
  blurb: string;
}

export interface WorldInfo {
  id: World;
  name: string;
  emoji: string;
  /** Verb for how you move here — "Fly" in the sky, "Swim" in the sea. */
  move: string;
  characters: Character[];
}

export const WORLDS: Record<World, WorldInfo> = {
  sky: {
    id: 'sky',
    name: 'Sky World',
    emoji: '☁️',
    move: 'Fly',
    characters: [
      { id: 'fairy', name: 'Fairy', emoji: '🧚', blurb: 'Flies by herself with sparkly wings.' },
      { id: 'butterfly', name: 'Butterfly', emoji: '🦋', blurb: 'Flutters through the clouds.' },
      { id: 'dragon', name: 'Dragon', emoji: '🐉', blurb: 'A friendly dragon that flies by itself.' },
      { id: 'princess', name: 'Princess', emoji: '👑', mount: '🦄', blurb: 'Rides a magic flying unicorn!' },
    ],
  },
  ocean: {
    id: 'ocean',
    name: 'Underwater World',
    emoji: '🌊',
    move: 'Swim',
    characters: [
      { id: 'mermaid', name: 'Mermaid', emoji: '🧜‍♀️', blurb: 'Swims by herself with a pretty tail.' },
      { id: 'seahorse', name: 'Seahorse', emoji: '🐠', blurb: 'A cute seahorse that swims by itself.' },
      { id: 'turtle', name: 'Sea Turtle', emoji: '🐢', blurb: 'A gentle turtle that glides along.' },
      { id: 'princess', name: 'Princess', emoji: '👸', mount: '🐬', blurb: 'Rides a friendly dolphin!' },
    ],
  },
};

export const WORLD_LIST: WorldInfo[] = [WORLDS.sky, WORLDS.ocean];

/** The three player colors + friendly names, in seat order. */
export const PLAYER_COLORS = ['#ff5fa2', '#a78bfa', '#38bdf8'];
export const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3'];
