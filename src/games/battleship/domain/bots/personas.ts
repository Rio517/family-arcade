/**
 * The computer captains — four characters, weakest to strongest, per
 * ADR 0009: picking your opponent IS picking the difficulty. The rung selects
 * the gunner's algorithm (random → hunt/target → parity → probability
 * density); the name and fleet skin are pure flavour the existing opponent UI
 * displays through the normal hello handshake.
 */
export interface CaptainPersona {
  id: string;
  /** The name on the enemy flag — flows through oppName like a real peer. */
  name: string;
  /** One warm line for the lobby ladder. */
  tagline: string;
  rung: 1 | 2 | 3 | 4;
  /** Which fleet colours the captain sails under (cosmetic, from SKINS). */
  skinId: string;
}

export const CAPTAIN_PERSONAS: readonly CaptainPersona[] = [
  {
    id: 'bobble',
    name: 'Deckhand Bobble',
    tagline: 'Fires wherever the seagull points.',
    rung: 1,
    skinId: 'aqua',
  },
  {
    id: 'marlin',
    name: 'Bosun Marlin',
    tagline: 'Smells a wounded ship from a mile off.',
    rung: 2,
    skinId: 'verdant',
  },
  {
    id: 'wake',
    name: 'Captain Wake',
    tagline: 'Sweeps the sea in neat, patient lines.',
    rung: 3,
    skinId: 'ember',
  },
  {
    id: 'grimtide',
    name: 'Admiral Grimtide',
    tagline: 'Counts every place your ships could hide.',
    rung: 4,
    skinId: 'void',
  },
];

/** Unknown ids fall back to the gentlest captain — never to a crash. */
export function captainById(id: string): CaptainPersona {
  return CAPTAIN_PERSONAS.find((p) => p.id === id) ?? CAPTAIN_PERSONAS[0];
}
