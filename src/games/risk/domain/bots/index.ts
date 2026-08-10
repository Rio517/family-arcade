/**
 * The computer generals (ADR 0009). Loaded via dynamic import() from the bot
 * turn effect so campaigns without a computer seat pay zero bytes for them.
 * Only what that effect consumes is re-exported; the setup screen imports the
 * persona metadata straight from ./personas (it must live in the main chunk).
 */
export { decide } from './decide';
export { personaById } from './personas';
