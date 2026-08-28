import type { CampaignLength, CampaignStateV1, CreateCampaignOptions, Talent } from './types';
import { validateCampaign } from './validateCampaign';

const CAMPAIGN_LENGTHS: readonly CampaignLength[] = ['adventure', 'voyage', 'legend'];
const TALENTS: readonly Talent[] = ['fencing', 'gunnery', 'navigation', 'charm', 'medicine'];
const RNG_SALTS = {
  world: 0x9e37_79b9,
  navigation: 0x243f_6a88,
  naval: 0xb7e1_5162,
} as const;

function mixSeed(seed: number, salt: number): number {
  return (Math.imul(1_664_525, (seed ^ salt) >>> 0) + 1_013_904_223) >>> 0;
}

function textLengthValid(value: string, maximum: number): boolean {
  const length = [...value.trim()].length;
  return length >= 1 && length <= maximum;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateOptions(options: CreateCampaignOptions): string[] {
  const issues: string[] = [];
  const input: unknown = options;
  if (!isPlainRecord(input)) return ['$:wrong-type'];

  if (typeof input.seed !== 'number') issues.push('seed:wrong-type');
  else if (!Number.isFinite(input.seed)) issues.push('seed:not-finite');
  else if (!Number.isInteger(input.seed)) issues.push('seed:not-integer');
  else if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffff_ffff) issues.push('seed:out-of-range');

  if (input.name !== undefined) {
    if (typeof input.name !== 'string') issues.push('name:wrong-type');
    else if (!textLengthValid(input.name, 40)) issues.push('name:out-of-range');
  }
  if (input.pronouns !== undefined) {
    if (typeof input.pronouns !== 'string') issues.push('pronouns:wrong-type');
    else if (!textLengthValid(input.pronouns, 24)) issues.push('pronouns:out-of-range');
  }
  if (input.talent !== undefined && (typeof input.talent !== 'string' || !TALENTS.some((talent) => talent === input.talent))) {
    issues.push('talent:unknown-id');
  }
  if (input.length !== undefined && (typeof input.length !== 'string' || !CAMPAIGN_LENGTHS.some((length) => length === input.length))) {
    issues.push('length:unknown-id');
  }
  return issues;
}

export function createCampaign(options: CreateCampaignOptions): CampaignStateV1 {
  const optionIssues = validateOptions(options);
  if (optionIssues.length > 0) throw new Error(`Invalid campaign options: ${optionIssues.join(', ')}`);

  const seed = options.seed;
  const state: CampaignStateV1 = {
    schemaVersion: 1,
    contentVersion: 'caribbean-slice-1',
    campaignId: `campaign-${seed}`,
    seed,
    career: { length: options.length ?? 'adventure' },
    calendar: { startYear: 1675, elapsedDays: 0 },
    mode: { kind: 'port', portId: 'bridgetown' },
    captain: {
      name: options.name ?? 'Captain',
      pronouns: options.pronouns ?? 'they/them',
      talent: options.talent ?? 'navigation',
    },
    wealth: { gold: 500, earned: 0 },
    crew: { morale: 'content' },
    fleet: {
      flagshipId: 'mistral',
      ships: [{
        id: 'mistral',
        classId: 'sloop',
        name: 'Mistral',
        hull: 100,
        sails: 100,
        crew: 50,
        cannon: 8,
        cargo: {
          provisions: 34,
          tools: 4,
          luxuries: 0,
          'sugar-molasses': 0,
          'tobacco-dyewood': 0,
          'powder-arms': 0,
        },
        fittings: [],
      }],
    },
    standings: { english: 0, french: 0, spanish: 0, dutch: 0 },
    world: {
      ports: { bridgetown: { prosperity: 'modest', defense: 'guarded' } },
      targetDefeated: false,
    },
    leads: [],
    relationships: {},
    legacy: { capturedShips: 0, goldEarned: 0 },
    rng: {
      world: mixSeed(seed, RNG_SALTS.world),
      navigation: mixSeed(seed, RNG_SALTS.navigation),
      naval: mixSeed(seed, RNG_SALTS.naval),
    },
    lastEventId: 0,
  };

  const validation = validateCampaign(state);
  if (!validation.ok) {
    throw new Error(`Invalid campaign state: ${validation.issues.map(({ path, code }) => `${path}:${code}`).join(', ')}`);
  }
  return validation.value;
}
