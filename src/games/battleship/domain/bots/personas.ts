/**
 * The computer captains — four characters, weakest to strongest, per
 * ADR 0009: picking your opponent IS picking the difficulty. The lobby shows
 * the level number and word; the name appears in the game (battle log, result)
 * through the normal hello handshake. The rung selects the gunner's algorithm
 * (random → hunt/target → parity → probability density).
 */
export interface CaptainPersona {
  id: string;
  /** The name on the enemy flag — flows through oppName like a real peer. */
  name: string;
  /** The one word the lobby's level button wears. */
  level: 'Easy' | 'Fair' | 'Sharp' | 'Boss';
  rung: 1 | 2 | 3 | 4;
}

export const CAPTAIN_PERSONAS: readonly CaptainPersona[] = [
  {
    id: 'bobble',
    name: 'Deckhand Bobble',
    level: 'Easy',
    rung: 1,
  },
  {
    id: 'marlin',
    name: 'Bosun Marlin',
    level: 'Fair',
    rung: 2,
  },
  {
    id: 'wake',
    name: 'Captain Wake',
    level: 'Sharp',
    rung: 3,
  },
  {
    id: 'grimtide',
    name: 'Admiral Grimtide',
    level: 'Boss',
    rung: 4,
  },
];

/** Unknown ids fall back to the gentlest captain — never to a crash. */
export function captainById(id: string): CaptainPersona {
  return CAPTAIN_PERSONAS.find((p) => p.id === id) ?? CAPTAIN_PERSONAS[0];
}
