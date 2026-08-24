import { describe, expect, it, vi } from 'vitest';

import {
  CAMPAIGN_WRITER_LOCK,
  createCampaignWriter,
  type LockManagerLike,
  type WriterRunResult,
} from './writer';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

interface PendingRequest {
  callback: (lock: unknown) => unknown | PromiseLike<unknown>;
  result: Deferred<unknown>;
}

class ControlledLocks implements LockManagerLike {
  readonly calls: Array<{ name: string; options: { mode: 'exclusive' } }> = [];
  readonly pending: PendingRequest[] = [];

  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: (lock: unknown) => T | PromiseLike<T>,
  ): Promise<T> {
    this.calls.push({ name, options });
    const result = deferred<unknown>();
    this.pending.push({ callback, result });
    return result.promise as Promise<T>;
  }

  grant(index: number): void {
    const pending = this.pending[index];
    if (!pending) throw new Error(`No pending request at ${index}`);
    Promise.resolve(pending.callback({ name: 'test-lock' })).then(
      pending.result.resolve,
      pending.result.reject,
    );
  }

  deny(index: number, error: unknown): void {
    const pending = this.pending[index];
    if (!pending) throw new Error(`No pending request at ${index}`);
    pending.result.reject(error);
  }

  rejectAfterCallback(index: number, error: unknown): void {
    const pending = this.pending[index];
    if (!pending) throw new Error(`No pending request at ${index}`);
    Promise.resolve(pending.callback({ name: 'test-lock' })).then(
      () => pending.result.reject(error),
      () => pending.result.reject(error),
    );
  }

  rejectImmediatelyAfterCallback(index: number, error: unknown): void {
    const pending = this.pending[index];
    if (!pending) throw new Error(`No pending request at ${index}`);
    Promise.resolve(pending.callback({ name: 'test-lock' })).catch(() => undefined);
    pending.result.reject(error);
  }

  callTwice(index: number): void {
    const pending = this.pending[index];
    if (!pending) throw new Error(`No pending request at ${index}`);
    Promise.all([
      Promise.resolve(pending.callback({ name: 'first-lock' })),
      Promise.resolve(pending.callback({ name: 'second-lock' })),
    ]).then(
      ([first]) => pending.result.resolve(first),
      pending.result.reject,
    );
  }

  async callTwiceResolvingSecond(index: number): Promise<void> {
    const pending = this.pending[index];
    if (!pending) throw new Error(`No pending request at ${index}`);
    Promise.resolve(pending.callback({ name: 'first-lock' })).catch(() => undefined);
    const second = await pending.callback({ name: 'second-lock' });
    pending.result.resolve(second);
    await pending.result.promise;
  }
}

describe('createCampaignWriter', () => {
  it('reports unavailable capability without ever executing an operation', async () => {
    const writer = createCampaignWriter(null);
    const operation = vi.fn();

    await expect(writer.run(operation)).resolves.toEqual({
      kind: 'acquisition-failed',
      reason: 'unavailable',
    });
    expect(writer.capability).toBe('unavailable');
    expect(operation).not.toHaveBeenCalled();
  });

  it('requests the exact exclusive campaign lock and preserves typed operation results', async () => {
    const locks = new ControlledLocks();
    const writer = createCampaignWriter(locks);
    const typedSuccess = { ok: true as const, value: 7 };
    const typedFailure = { ok: false as const, reason: 'save-conflict' as const };

    const successPromise = writer.run(() => typedSuccess);
    await flushMicrotasks();
    expect(locks.calls).toEqual([{
      name: CAMPAIGN_WRITER_LOCK,
      options: { mode: 'exclusive' },
    }]);
    locks.grant(0);
    await expect(successPromise).resolves.toEqual({
      kind: 'operation-result',
      result: typedSuccess,
    });

    const failurePromise = writer.run(() => typedFailure);
    await flushMicrotasks();
    locks.grant(1);
    await expect(failurePromise).resolves.toEqual({
      kind: 'operation-result',
      result: typedFailure,
    });
    expect(writer.capability).toBe('available');
  });

  it('distinguishes acquisition denial before callback from synchronous operation throw', async () => {
    const locks = new ControlledLocks();
    const writer = createCampaignWriter(locks);
    const denied = new Error('permission denied');
    const operationError = new Error('operation failed');
    const deniedOperation = vi.fn();

    const deniedPromise = writer.run(deniedOperation);
    await flushMicrotasks();
    locks.deny(0, denied);
    await expect(deniedPromise).resolves.toEqual({
      kind: 'acquisition-failed',
      reason: 'denied',
      error: denied,
    });
    expect(deniedOperation).not.toHaveBeenCalled();

    const thrownPromise = writer.run(() => {
      throw operationError;
    });
    await flushMicrotasks();
    locks.grant(1);
    await expect(thrownPromise).resolves.toEqual({
      kind: 'operation-threw',
      error: operationError,
    });
  });

  it('tags an asynchronous operation rejection as operation-threw', async () => {
    const locks = new ControlledLocks();
    const writer = createCampaignWriter(locks);
    const operationError = new Error('async operation failed');
    const operation = deferred<never>();

    const runPromise = writer.run(() => operation.promise);
    await flushMicrotasks();
    locks.grant(0);
    operation.reject(operationError);

    await expect(runPromise).resolves.toEqual({
      kind: 'operation-threw',
      error: operationError,
    });
  });

  it('reports a platform rejection after callback start as a writer protocol failure', async () => {
    const locks = new ControlledLocks();
    const writer = createCampaignWriter(locks);
    const protocolError = new Error('platform rejected after callback');

    const runPromise = writer.run(() => 'finished');
    await flushMicrotasks();
    locks.rejectAfterCallback(0, protocolError);

    await expect(runPromise).resolves.toEqual({
      kind: 'writer-protocol-failure',
      error: protocolError,
    });
  });

  it('keeps the FIFO closed until a pending callback finishes after an immediate platform rejection', async () => {
    const locks = new ControlledLocks();
    const writer = createCampaignWriter(locks);
    const operation = deferred<string>();
    let aSettled = false;

    const a = writer.run(() => operation.promise).then((result) => {
      aSettled = true;
      return result;
    });
    await flushMicrotasks();
    locks.rejectImmediatelyAfterCallback(0, new Error('early platform rejection'));
    const bOperation = vi.fn(() => 'B');
    const b = writer.run(bOperation);
    await flushMicrotasks();

    expect(aSettled).toBe(false);
    expect(locks.calls).toHaveLength(1);
    expect(bOperation).not.toHaveBeenCalled();

    operation.resolve('A');
    await expect(a).resolves.toMatchObject({ kind: 'writer-protocol-failure' });
    await flushMicrotasks();
    expect(locks.calls).toHaveLength(2);
    locks.grant(1);
    await expect(b).resolves.toEqual({ kind: 'operation-result', result: 'B' });
  });

  it('executes the operation exactly once and reports a callback-twice protocol failure', async () => {
    const locks = new ControlledLocks();
    const writer = createCampaignWriter(locks);
    const operation = vi.fn(() => 'finished');

    const runPromise = writer.run(operation);
    await flushMicrotasks();
    locks.callTwice(0);

    const result = await runPromise;
    expect(result.kind).toBe('writer-protocol-failure');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('keeps callback-twice FIFO closed when the adapter resolves from the second callback', async () => {
    const locks = new ControlledLocks();
    const writer = createCampaignWriter(locks);
    const operation = deferred<string>();
    let aSettled = false;

    const a = writer.run(() => operation.promise).then((result) => {
      aSettled = true;
      return result;
    });
    await flushMicrotasks();
    await locks.callTwiceResolvingSecond(0);
    const bOperation = vi.fn(() => 'B');
    const b = writer.run(bOperation);
    await flushMicrotasks();

    expect(aSettled).toBe(false);
    expect(locks.calls).toHaveLength(1);
    expect(bOperation).not.toHaveBeenCalled();

    operation.resolve('A');
    await expect(a).resolves.toMatchObject({ kind: 'writer-protocol-failure' });
    await flushMicrotasks();
    expect(locks.calls).toHaveLength(2);
    locks.grant(1);
    await expect(b).resolves.toEqual({ kind: 'operation-result', result: 'B' });
  });

  it('settles immediately unavailable runs in invocation order without callbacks', async () => {
    const writer = createCampaignWriter(null);
    const settlements: string[] = [];
    const operationA = vi.fn();
    const operationB = vi.fn();

    const a = writer.run(operationA).then((result) => {
      settlements.push('A');
      return result;
    });
    const b = writer.run(operationB).then((result) => {
      settlements.push('B');
      return result;
    });

    await expect(Promise.all([a, b])).resolves.toEqual([
      { kind: 'acquisition-failed', reason: 'unavailable' },
      { kind: 'acquisition-failed', reason: 'unavailable' },
    ]);
    expect(settlements).toEqual(['A', 'B']);
    expect(operationA).not.toHaveBeenCalled();
    expect(operationB).not.toHaveBeenCalled();
  });

  const fifoRows: Array<{
    label: string;
    operation: () => unknown | PromiseLike<unknown>;
    settle(locks: ControlledLocks): void;
    expected: WriterRunResult<unknown>;
  }> = [
    {
      label: 'operation success',
      operation: () => ({ ok: true }),
      settle: (locks) => locks.grant(0),
      expected: { kind: 'operation-result', result: { ok: true } },
    },
    {
      label: 'typed operation failure',
      operation: () => ({ ok: false, reason: 'typed-failure' }),
      settle: (locks) => locks.grant(0),
      expected: {
        kind: 'operation-result',
        result: { ok: false, reason: 'typed-failure' },
      },
    },
    {
      label: 'synchronous throw',
      operation: () => {
        throw new Error('sync failure');
      },
      settle: (locks) => locks.grant(0),
      expected: { kind: 'operation-threw', error: new Error('sync failure') },
    },
    (() => {
      const operationResult = deferred<never>();
      return {
        label: 'asynchronous rejection',
        operation: () => operationResult.promise,
        settle: (locks: ControlledLocks) => {
          locks.grant(0);
          operationResult.reject(new Error('async failure'));
        },
        expected: {
          kind: 'operation-threw' as const,
          error: new Error('async failure'),
        },
      };
    })(),
    {
      label: 'deferred acquisition denial',
      operation: vi.fn(),
      settle: (locks) => locks.deny(0, new Error('denied')),
      expected: {
        kind: 'acquisition-failed',
        reason: 'denied',
        error: new Error('denied'),
      },
    },
    {
      label: 'writer protocol failure',
      operation: () => 'ignored result',
      settle: (locks) => locks.rejectAfterCallback(0, new Error('protocol')),
      expected: {
        kind: 'writer-protocol-failure',
        error: new Error('protocol'),
      },
    },
  ];

  it.each(fifoRows)(
    'recovers its FIFO tail after $label before requesting B and then C',
    async ({ operation, settle, expected }) => {
      const locks = new ControlledLocks();
      const writer = createCampaignWriter(locks);
      const bOperation = vi.fn(() => 'B result');
      const cOperation = vi.fn(() => 'C result');
      let aSettled = false;

      const a = writer.run(operation).then((result) => {
        aSettled = true;
        return result;
      });
      await flushMicrotasks();
      expect(locks.calls).toHaveLength(1);

      const b = writer.run(bOperation);
      await flushMicrotasks();
      expect(aSettled).toBe(false);
      expect(locks.calls).toHaveLength(1);
      expect(bOperation).not.toHaveBeenCalled();

      settle(locks);
      await expect(a).resolves.toEqual(expected);
      await flushMicrotasks();
      expect(locks.calls).toHaveLength(2);
      expect(bOperation).not.toHaveBeenCalled();

      locks.grant(1);
      await expect(b).resolves.toEqual({
        kind: 'operation-result',
        result: 'B result',
      });
      expect(bOperation).toHaveBeenCalledTimes(1);

      const c = writer.run(cOperation);
      await flushMicrotasks();
      expect(locks.calls).toHaveLength(3);
      locks.grant(2);
      await expect(c).resolves.toEqual({
        kind: 'operation-result',
        result: 'C result',
      });
      expect(cOperation).toHaveBeenCalledTimes(1);
    },
  );
});
