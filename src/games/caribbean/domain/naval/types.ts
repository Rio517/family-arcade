export const NAVAL_TICK_RATE = 60;

export type NavalShipId = 'player' | 'opponent';
export type Broadside = 'port' | 'starboard';
export type Ammunition = 'round' | 'chain' | 'grape';
export type SailSetting = 'full' | 'reefed';
export type Rudder = -1 | 0 | 1;

export interface Point {
  x: number;
  z: number;
}

export interface Damage {
  hull: number;
  sails: number;
  crew: number;
  cannon: number;
}

export interface NavalShipInput {
  id: NavalShipId;
  stableShipId: string;
  name: string;
  classId: 'sloop';
  position: Point;
  heading: number;
  hull: number;
  sails: number;
  crew: number;
  cannon: number;
}

export interface NavalBattleInput {
  battleId: string;
  seed: number;
  windFrom: number;
  windStrength: number;
  arenaRadius: number;
  timeLimitTicks: number;
  objective: 'capture-red-jackdaw';
  player: NavalShipInput;
  opponent: NavalShipInput;
}

export interface NavalCommand {
  rudder: Rudder;
  sail: SailSetting;
  ammunition: Ammunition;
  fire: Broadside | null;
}

export type NavalCommands = Partial<Record<NavalShipId, NavalCommand>>;

export interface ReloadState {
  progress: number;
  required: number;
  loaded: boolean;
}

export interface NavalShipState extends NavalShipInput {
  speed: number;
  rudder: Rudder;
  sail: SailSetting;
  ammunition: Ammunition;
  reload: Record<Broadside, ReloadState>;
}

export interface ShotSample {
  index: number;
  normalizedSpread: number;
  hit: boolean;
}

export interface VolleyResult {
  volleyId: number;
  side: Broadside;
  ammunition: Ammunition;
  fired: number;
  hits: number;
  misses: number;
  damage: Damage;
  seedAfter: number;
  samples: ShotSample[];
}

export type NavalOutcome =
  | { kind: 'surrender' | 'sunk' | 'boarding-ready'; victorShipId: NavalShipId }
  | { kind: 'escaped' | 'separated'; shipId: NavalShipId };

export type NavalEvent =
  | { id: number; kind: 'volley'; atTick: number; shipId: NavalShipId; targetShipId: NavalShipId; result: VolleyResult }
  | { id: number; kind: 'damage'; atTick: number; shipId: NavalShipId; damage: Damage }
  | { id: number; kind: 'reload-ready'; atTick: number; shipId: NavalShipId; side: Broadside }
  | { id: number; kind: 'outcome'; atTick: number; outcome: NavalOutcome };

export interface NavalState {
  input: NavalBattleInput;
  seed: number;
  tick: number;
  nextEventId: number;
  nextVolleyId: number;
  ships: Record<NavalShipId, NavalShipState>;
  events: NavalEvent[];
  outcome: NavalOutcome | null;
}
