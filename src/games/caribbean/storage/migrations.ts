export interface SaveEnvelopeV1Wire {
  version: 1;
  build: string;
  savedAt: number;
  checksum: string;
  payload: unknown;
}

export function migrateSaveEnvelope<T extends SaveEnvelopeV1Wire>(envelope: T): T {
  switch (envelope.version) {
    case 1:
      return envelope;
  }
}
