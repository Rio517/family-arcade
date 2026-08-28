import type { CampaignJournal } from '../domain/events';
import { validateJournal } from '../domain/replay';
import { checksumPayload } from './checksum';
import { migrateSaveEnvelope, type SaveEnvelopeV1Wire } from './migrations';

export interface SaveEnvelopeV1 {
  version: 1;
  build: string;
  savedAt: number;
  checksum: string;
  payload: CampaignJournal;
}

export type UnreadableCode =
  | 'malformed-json'
  | 'invalid-envelope'
  | 'unsupported-version'
  | 'checksum-mismatch'
  | 'invalid-journal'
  | 'replay-mismatch';

export type ParseSaveEnvelopeResult =
  | { ok: true; envelope: SaveEnvelopeV1 }
  | { ok: false; code: UnreadableCode };

const ENVELOPE_KEYS = ['version', 'build', 'savedAt', 'checksum', 'payload'] as const;
const CHECKSUM_PATTERN = /^[0-9a-f]{8}$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactEnvelopeKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === ENVELOPE_KEYS.length
    && keys.every((key, index) => key === [...ENVELOPE_KEYS].sort()[index]);
}

function isBuild(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const characters = [...value];
  const containsControlCharacter = characters.some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint >= 0x7f && codePoint <= 0x9f;
  });
  return characters.length >= 1
    && characters.length <= 128
    && !containsControlCharacter;
}

function isSavedAt(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0;
}

function isChecksum(value: unknown): value is string {
  return typeof value === 'string' && CHECKSUM_PATTERN.test(value);
}

function readWireEnvelope(value: unknown):
  | { ok: true; envelope: SaveEnvelopeV1Wire }
  | { ok: false; code: 'invalid-envelope' | 'unsupported-version' } {
  if (!isPlainRecord(value) || !hasExactEnvelopeKeys(value)) {
    return { ok: false, code: 'invalid-envelope' };
  }
  const { version, build, savedAt, checksum, payload } = value;
  if (
    typeof version !== 'number'
    || !Number.isSafeInteger(version)
    || version < 0
  ) {
    return { ok: false, code: 'invalid-envelope' };
  }
  if (version !== 1) return { ok: false, code: 'unsupported-version' };
  if (!isBuild(build) || !isSavedAt(savedAt) || !isChecksum(checksum)) {
    return { ok: false, code: 'invalid-envelope' };
  }
  return {
    ok: true,
    envelope: { version, build, savedAt, checksum, payload },
  };
}

export function parseSaveEnvelope(raw: string): ParseSaveEnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, code: 'malformed-json' };
  }

  const wire = readWireEnvelope(parsed);
  if (!wire.ok) return wire;

  let payloadChecksum: string;
  try {
    payloadChecksum = checksumPayload(wire.envelope.payload);
  } catch {
    return { ok: false, code: 'invalid-envelope' };
  }
  if (payloadChecksum !== wire.envelope.checksum) {
    return { ok: false, code: 'checksum-mismatch' };
  }

  const migrated = migrateSaveEnvelope(wire.envelope);
  const journal = validateJournal(migrated.payload);
  if (!journal.ok) {
    return {
      ok: false,
      code: journal.issues.some(({ code }) => code === 'replay-mismatch')
        ? 'replay-mismatch'
        : 'invalid-journal',
    };
  }

  return {
    ok: true,
    envelope: {
      version: 1,
      build: migrated.build,
      savedAt: migrated.savedAt,
      checksum: migrated.checksum,
      payload: journal.value,
    },
  };
}
