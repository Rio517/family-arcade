/**
 * The computer generals — four characters, weakest to strongest, per
 * ADR 0009: picking your opponent IS picking the difficulty. One mechanism
 * grades them all: candidate moves are scored, and a persona's temperature
 * decides how faithfully it follows those scores (high = wobbly, endearing
 * blunders; low = cold competence).
 */
export interface RiskPersona {
  id: string;
  /** The name on the seat — shown on the plaque, the rail, the victory card. */
  name: string;
  /** One warm line for the setup screen. */
  tagline: string;
  rung: 1 | 2 | 3 | 4;
  /** Softmax temperature over move scores; high wobbles, low is ruthless. */
  temperature: number;
  /** Required army advantage ((attackers − 1) − defenders) to consider a fight. */
  attackEdge: number;
  /** Chance per turn the persona bothers to fortify at all. */
  fortifyChance: number;
}

export const RISK_PERSONAS: readonly RiskPersona[] = [
  {
    id: 'cadet',
    name: 'Cadet Pip',
    tagline: 'Brand new boots, boundless enthusiasm.',
    rung: 1,
    temperature: 1.4,
    attackEdge: 2,
    fortifyChance: 0,
  },
  {
    id: 'wren',
    name: 'Scout Wren',
    tagline: 'Reads the map, mostly the right way up.',
    rung: 2,
    temperature: 0.8,
    attackEdge: 1,
    fortifyChance: 0.5,
  },
  {
    id: 'flint',
    name: 'General Flint',
    tagline: 'Holds the line. Then moves it forward.',
    rung: 3,
    temperature: 0.35,
    attackEdge: 0,
    fortifyChance: 1,
  },
  {
    id: 'vex',
    name: 'Field Marshal Vex',
    tagline: 'Has already planned your surrender.',
    rung: 4,
    temperature: 0.12,
    attackEdge: -1,
    fortifyChance: 1,
  },
];

/** Unknown ids fall back to the friendliest general — never to a crash. */
export function personaById(id: string): RiskPersona {
  return RISK_PERSONAS.find((p) => p.id === id) ?? RISK_PERSONAS[0];
}
