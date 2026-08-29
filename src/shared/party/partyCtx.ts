/**
 * The party's React context object, on its own so a harness page can wear a
 * hand-made party (the screenshot run has no second device to connect to).
 * Everything else — the provider, the hook, the value's shape — lives in
 * PartyContext.tsx.
 */
import { createContext } from 'react';
import type { PartyValue } from './PartyContext';

export const PartyCtx = createContext<PartyValue | null>(null);
