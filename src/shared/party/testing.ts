/**
 * Test helper: a complete, inert `PartyValue` to hand a mocked `useParty`.
 * Every field is present (a partial cast dies with an opaque TypeError the day
 * a component reads one more field), the writers are `vi.fn()`s so tests can
 * assert on them, and `openTable` returns 'WXYZ' unless overridden.
 *
 *   vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));
 *   mockParty.value = fakeParty({ inParty: true, role: 'host', theirName: 'Kai' });
 */
import { vi } from 'vitest';
import type { PartyValue } from './PartyContext';

export function fakeParty(over: Partial<PartyValue> = {}): PartyValue {
  return {
    myName: 'Klara',
    status: 'idle',
    code: '',
    role: null,
    inParty: false,
    theirName: null,
    reconnecting: false,
    table: null,
    knock: null,
    hostParty: vi.fn(() => 'PRTY'),
    joinParty: vi.fn(),
    leaveParty: vi.fn(),
    retry: vi.fn(),
    openTable: vi.fn(() => 'WXYZ'),
    closeTable: vi.fn(),
    knockOn: vi.fn(),
    clearKnock: vi.fn(),
    resolveGame: vi.fn(() => null),
    effects: [],
    theirEffects: [],
    setEffects: vi.fn(),
    call: {
      active: false,
      status: 'idle',
      muted: false,
      cameraOn: false,
      localStream: null,
      remoteStream: null,
      start: vi.fn(),
      stop: vi.fn(),
      toggleMute: vi.fn(),
      toggleCamera: vi.fn(),
    },
    ...over,
  };
}

/** A party already linked with Kai, as host or guest. */
export function fakePartyWithKai(role: 'host' | 'guest', over: Partial<PartyValue> = {}): PartyValue {
  return fakeParty({ inParty: true, status: 'connected', code: 'PRTY', role, theirName: 'Kai', ...over });
}
