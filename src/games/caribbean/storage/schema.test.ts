import { describe, expect, it } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import type { CampaignJournal } from '../domain/events';
import { appendJournal, createJournal } from '../domain/replay';
import { canonicalJson, checksumPayload } from './checksum';
import { migrateSaveEnvelope } from './migrations';
import {
  parseSaveEnvelope,
  type SaveEnvelopeV1,
} from './schema';

function validJournal(): CampaignJournal {
  return appendJournal(
    createJournal(createCampaign({ seed: 1702, name: 'Morgan' })),
    { type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } },
  );
}

function validEnvelope(journal = validJournal()): SaveEnvelopeV1 {
  return {
    version: 1,
    build: 'test-build',
    savedAt: 1_702,
    checksum: checksumPayload(journal),
    payload: journal,
  };
}

function rawEnvelope(overrides: Record<string, unknown> = {}): string {
  return canonicalJson({ ...validEnvelope(), ...overrides });
}

describe('migrateSaveEnvelope', () => {
  it('dispatches the current V1 envelope through the identity migration', () => {
    const envelope = validEnvelope();

    expect(migrateSaveEnvelope(envelope)).toBe(envelope);
  });
});

describe('parseSaveEnvelope', () => {
  it('parses a legacy V1 journal whose worlds have no lastVoyage field without adding one', () => {
    // Kills making the optional Task-2 summary mandatory or migration-time default insertion.
    const journal = validJournal();
    delete journal.initial.world.lastVoyage;
    delete journal.state.world.lastVoyage;
    const envelope = validEnvelope(journal);
    const raw = canonicalJson(envelope);

    const parsed = parseSaveEnvelope(raw);

    expect(parsed).toEqual({ ok: true, envelope });
    if (!parsed.ok) throw new Error('fixture must parse');
    expect(Object.prototype.hasOwnProperty.call(parsed.envelope.payload.initial.world, 'lastVoyage')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed.envelope.payload.state.world, 'lastVoyage')).toBe(false);
  });

  it('parses and validates the exact current envelope', () => {
    const envelope = validEnvelope();

    expect(parseSaveEnvelope(canonicalJson(envelope))).toEqual({
      ok: true,
      envelope,
    });
  });

  it('distinguishes malformed JSON from an invalid envelope shape', () => {
    expect(parseSaveEnvelope('{broken')).toEqual({ ok: false, code: 'malformed-json' });
    expect(parseSaveEnvelope('null')).toEqual({ ok: false, code: 'invalid-envelope' });
    expect(parseSaveEnvelope('[]')).toEqual({ ok: false, code: 'invalid-envelope' });
  });

  it.each([
    ['unknown key', () => rawEnvelope({ extra: true })],
    ['missing payload', () => {
      const envelope = validEnvelope() as unknown as Record<string, unknown>;
      delete envelope.payload;
      return canonicalJson(envelope);
    }],
    ['non-integer version', () => rawEnvelope({ version: 1.5 })],
    ['string version', () => rawEnvelope({ version: '1' })],
  ] as const)('rejects envelope key/version shape: %s', (_label, createRaw) => {
    expect(parseSaveEnvelope(createRaw())).toEqual({ ok: false, code: 'invalid-envelope' });
  });

  it.each([0, 2, 99] as const)('rejects unsupported past/future version %s before checksum dispatch', (version) => {
    expect(parseSaveEnvelope(rawEnvelope({ version, checksum: '00000000' }))).toEqual({
      ok: false,
      code: 'unsupported-version',
    });
  });

  it.each([
    ['', 'empty'],
    ['x'.repeat(129), 'oversized'],
    ['line\nbreak', 'control-character'],
    [7, 'wrong-type'],
  ] as const)('rejects an %s build value', (build, _label) => {
    expect(parseSaveEnvelope(rawEnvelope({ build }))).toEqual({ ok: false, code: 'invalid-envelope' });
  });

  it.each([
    [-1, 'negative'],
    [1.5, 'fractional'],
    [Number.MAX_SAFE_INTEGER + 1, 'unsafe'],
    ['1702', 'wrong-type'],
  ] as const)('rejects an %s savedAt value', (savedAt, _label) => {
    expect(parseSaveEnvelope(rawEnvelope({ savedAt }))).toEqual({ ok: false, code: 'invalid-envelope' });
  });

  it.each([
    ['ABCDEF12', 'uppercase'],
    ['abcdef1', 'short'],
    ['not-hex!', 'non-hex'],
    [12345678, 'wrong-type'],
  ] as const)('rejects an %s checksum field', (checksum, _label) => {
    expect(parseSaveEnvelope(rawEnvelope({ checksum }))).toEqual({ ok: false, code: 'invalid-envelope' });
  });

  it('rejects a well-shaped envelope whose payload checksum does not match', () => {
    expect(parseSaveEnvelope(rawEnvelope({ checksum: '00000000' }))).toEqual({
      ok: false,
      code: 'checksum-mismatch',
    });
  });

  it('classifies a checksummed invalid journal after checksum and migration', () => {
    const journal = validJournal();
    journal.state.wealth.gold = -1;

    expect(parseSaveEnvelope(rawEnvelope({
      payload: journal,
      checksum: checksumPayload(journal),
    }))).toEqual({ ok: false, code: 'invalid-journal' });
  });

  it('classifies replay divergence separately after checksum and migration', () => {
    const journal = validJournal();
    journal.state.wealth.gold += 1;

    expect(parseSaveEnvelope(rawEnvelope({
      payload: journal,
      checksum: checksumPayload(journal),
    }))).toEqual({ ok: false, code: 'replay-mismatch' });
  });
});
