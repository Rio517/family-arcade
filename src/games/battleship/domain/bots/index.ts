/**
 * The computer captains (ADR 0009). Loaded via dynamic import() from the
 * loopback peer so games against humans pay zero bytes for them.
 */
export { decideShot } from './gunner';
export { captainById, CAPTAIN_PERSONAS, type CaptainPersona } from './personas';
