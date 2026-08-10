/**
 * The computer captains (ADR 0009). Loaded via dynamic import() from the
 * loopback peer so games against humans pay zero bytes for them. Only what
 * the loopback consumes is re-exported; the lobby imports the persona
 * metadata straight from ./personas (it must live in the main chunk).
 */
export { decideShot } from './gunner';
export { captainById } from './personas';
