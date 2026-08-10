/**
 * The computer generals (ADR 0009). Loaded via dynamic import() from the bot
 * turn effect so campaigns without a computer seat pay zero bytes for them.
 */
export { decide, type BotStep } from './decide';
export { personaById, RISK_PERSONAS, type RiskPersona } from './personas';
