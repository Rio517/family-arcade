export const CAMPAIGN_WRITER_LOCK = 'caribbean:campaign:writer';

export interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: (lock: unknown) => T | PromiseLike<T>,
  ): Promise<T>;
}

export type WriterRunResult<T> =
  | { kind: 'operation-result'; result: T }
  | { kind: 'operation-threw'; error: unknown }
  | {
      kind: 'acquisition-failed';
      reason: 'unavailable' | 'denied';
      error?: unknown;
    }
  | { kind: 'writer-protocol-failure'; error: unknown };

export interface CampaignWriter {
  readonly capability: 'available' | 'unavailable';
  run<T>(operation: () => T | PromiseLike<T>): Promise<WriterRunResult<T>>;
}

type CallbackResult<T> =
  | { kind: 'callback-operation-result'; result: T }
  | { kind: 'callback-operation-threw'; error: unknown };

export function createCampaignWriter(
  locks: LockManagerLike | null,
): CampaignWriter {
  let tail = Promise.resolve();

  return {
    capability: locks === null ? 'unavailable' : 'available',

    run<T>(operation: () => T | PromiseLike<T>): Promise<WriterRunResult<T>> {
      const runUnderWebLock = async (): Promise<WriterRunResult<T>> => {
        if (locks === null) {
          return { kind: 'acquisition-failed', reason: 'unavailable' };
        }

        let callbackStarted = false;
        let protocolError: unknown | null = null;
        let callbackCompletion: Promise<CallbackResult<T>> | null = null;
        try {
          const callbackResult = await locks.request<CallbackResult<T>>(
            CAMPAIGN_WRITER_LOCK,
            { mode: 'exclusive' },
            () => {
              if (callbackStarted) {
                protocolError = new Error('Campaign writer lock callback executed more than once');
                return Promise.resolve({
                  kind: 'callback-operation-threw',
                  error: protocolError,
                });
              }
              callbackStarted = true;
              callbackCompletion = (async () => {
                try {
                  return {
                    kind: 'callback-operation-result',
                    result: await operation(),
                  };
                } catch (error) {
                  return { kind: 'callback-operation-threw', error };
                }
              })();
              return callbackCompletion;
            },
          );

          if (protocolError !== null) {
            return { kind: 'writer-protocol-failure', error: protocolError };
          }
          if (!callbackStarted) {
            return {
              kind: 'writer-protocol-failure',
              error: new Error('Campaign writer lock request resolved without callback'),
            };
          }
          if (callbackResult.kind === 'callback-operation-result') {
            return { kind: 'operation-result', result: callbackResult.result };
          }
          if (callbackResult.kind === 'callback-operation-threw') {
            return { kind: 'operation-threw', error: callbackResult.error };
          }
          return {
            kind: 'writer-protocol-failure',
            error: new Error('Campaign writer lock returned an invalid callback result'),
          };
        } catch (error) {
          if (!callbackStarted) {
            return { kind: 'acquisition-failed', reason: 'denied', error };
          }
          if (callbackCompletion !== null) await callbackCompletion;
          return { kind: 'writer-protocol-failure', error: protocolError ?? error };
        }
      };

      const previous = tail;
      const runPromise = previous.then(runUnderWebLock);
      tail = runPromise.then(() => undefined, () => undefined);
      return runPromise;
    },
  };
}
