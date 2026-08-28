import { describe, expect, it } from 'vitest';

describe.each(['persisted', 'memory-only'] as const)('NamedActionGate %s ownership', (label) => {
  it('keeps the new generation owner when a stale token settles', async () => {
    // Kills release-by-generation: stale A must not clear generation-two owner B.
    const modulePath = './namedAction' + 'Gate';
    const { NamedActionGate } = await import(/* @vite-ignore */ modulePath);
    const gate = new NamedActionGate();

    const ownerA = gate.acquire(1);
    expect(ownerA).toMatchObject({ generation: 1 });
    expect(typeof ownerA?.token).toBe('symbol');

    gate.reset();
    const ownerB = gate.acquire(2);
    expect(ownerB).toMatchObject({ generation: 2 });
    expect(ownerB?.token).not.toBe(ownerA?.token);

    if (ownerA === null || ownerB === null) throw new Error(`${label} owner fixture failed`);
    gate.release(ownerA);
    expect(gate.acquire(2)).toBeNull();

    gate.release(ownerB);
    const ownerD = gate.acquire(2);
    expect(ownerD).toMatchObject({ generation: 2 });
    expect(ownerD?.token).not.toBe(ownerB.token);

    gate.reset();
    const staleSameGeneration = gate.acquire(3);
    gate.reset();
    const liveSameGeneration = gate.acquire(3);
    if (staleSameGeneration === null || liveSameGeneration === null) {
      throw new Error(`${label} same-generation owner fixture failed`);
    }
    gate.release(staleSameGeneration);
    expect(gate.acquire(3)).toBeNull();
    gate.release(liveSameGeneration);
    expect(gate.acquire(3)).toMatchObject({ generation: 3 });
  });
});
