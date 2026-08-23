import {
  applyDamage,
  bearingSide,
  broadsideVector,
  createBattle,
  damageProfile,
  fireBroadside,
  sailingEfficiency,
  stepBattle,
  type BattleCommand,
  type BattleState,
} from './battle';

describe('sailingEfficiency', () => {
  it.each([
    [0, 0.08],
    [30, 0.18],
    [60, 0.65],
    [90, 1],
    [135, 0.88],
    [180, 0.65],
  ])('makes the point of sail matter at %d° off the wind', (degrees, want) => {
    expect(sailingEfficiency((degrees * Math.PI) / 180)).toBeCloseTo(want, 5);
  });

  it('is symmetrical to port and starboard', () => {
    expect(sailingEfficiency(-Math.PI / 3)).toBeCloseTo(0.65, 5);
  });
});

describe('ship handling', () => {
  it('gives a reefed ship more turn authority but less distance', () => {
    const full = createBattle({ seed: 42 });
    full.ships.player.heading = Math.PI / 2;
    full.ships.player.rudder = 1;
    full.ships.player.sail = 'full';

    const reefed = structuredClone(full);
    reefed.ships.player.sail = 'reefed';

    const afterFull = stepBattle(full, {}, 1);
    const afterReefed = stepBattle(reefed, {}, 1);

    expect(Math.abs(afterReefed.ships.player.heading - Math.PI / 2)).toBeGreaterThan(
      Math.abs(afterFull.ships.player.heading - Math.PI / 2),
    );
    expect(afterReefed.ships.player.position.x).toBeLessThan(
      afterFull.ships.player.position.x,
    );
  });

  it('barely advances while pointing directly into the wind', () => {
    const state = createBattle({ seed: 7, windFrom: 0 });
    state.ships.player.heading = 0;
    const next = stepBattle(state, {}, 1);

    expect(next.ships.player.position.z).toBeCloseTo(-32.552, 3);
  });
});

describe('broadside fire', () => {
  it('maps physical sides for a ship whose bow points +Z', () => {
    expect(broadsideVector(0, 'port')).toEqual({ x: 1, z: 0 });
    expect(broadsideVector(0, 'starboard')).toEqual({ x: -1, z: 0 });
    expect(bearingSide({ x: 0, z: 0 }, 0, { x: 20, z: 0 })).toBe('port');
    expect(bearingSide({ x: 0, z: 0 }, 0, { x: -20, z: 0 })).toBe('starboard');
  });

  it.each([
    [0, { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 20, z: 0 }, { x: -20, z: 0 }],
    [Math.PI / 2, { x: 0, z: -1 }, { x: 0, z: 1 }, { x: 0, z: -20 }, { x: 0, z: 20 }],
    [Math.PI, { x: -1, z: 0 }, { x: 1, z: 0 }, { x: -20, z: 0 }, { x: 20, z: 0 }],
    [-Math.PI / 2, { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 0, z: 20 }, { x: 0, z: -20 }],
  ])('maps port and starboard at heading %d', (heading, port, starboard, portTarget, starboardTarget) => {
    const portVector = broadsideVector(heading, 'port');
    const starboardVector = broadsideVector(heading, 'starboard');

    expect(portVector.x).toBeCloseTo(port.x, 10);
    expect(portVector.z).toBeCloseTo(port.z, 10);
    expect(starboardVector.x).toBeCloseTo(starboard.x, 10);
    expect(starboardVector.z).toBeCloseTo(starboard.z, 10);
    expect(bearingSide({ x: 0, z: 0 }, heading, portTarget)).toBe('port');
    expect(bearingSide({ x: 0, z: 0 }, heading, starboardTarget)).toBe('starboard');
  });

  it('launches each broadside from its named physical side', () => {
    const state = createBattle({ seed: 123 });
    state.ships.player.position = { x: 0, z: 0 };
    state.ships.player.heading = 0;

    const port = fireBroadside(state, 'player', 'port');
    const starboard = fireBroadside(state, 'player', 'starboard');

    expect(port.projectiles.every((shot) => shot.position.x > 0 && shot.velocity.x > 0)).toBe(true);
    expect(starboard.projectiles.every((shot) => shot.position.x < 0 && shot.velocity.x < 0)).toBe(true);
  });

  it('launches port projectiles toward port at a non-zero heading', () => {
    const state = createBattle({ seed: 123 });
    state.ships.player.position = { x: 0, z: 0 };
    state.ships.player.heading = Math.PI / 2;

    const port = fireBroadside(state, 'player', 'port');

    expect(port.projectiles.every((shot) => shot.position.z < 0 && shot.velocity.z < 0)).toBe(true);
  });

  it('turns a starboard rudder toward physical starboard', () => {
    const state = createBattle({ seed: 44 });
    state.ships.player.heading = 0;
    const next = stepBattle(state, { player: { rudder: 1 } }, 0.5);
    expect(next.ships.player.heading).toBeLessThan(0);
  });

  it('fires only a loaded side and starts that side reloading', () => {
    const state = createBattle({ seed: 123 });
    const fired = fireBroadside(state, 'player', 'port');

    expect(fired.projectiles).toHaveLength(4);
    expect(fired.ships.player.reload.port).toBe(6);
    expect(fired.ships.player.reload.starboard).toBe(0);

    const blocked = fireBroadside(fired, 'player', 'port');
    expect(blocked.projectiles).toHaveLength(4);
    expect(blocked.events).toHaveLength(fired.events.length);
  });

  it('reloads with elapsed simulation time, never wall-clock time', () => {
    const fired = fireBroadside(createBattle({ seed: 5 }), 'player', 'starboard');
    const almost = stepBattle(fired, {}, 5.9);
    const ready = stepBattle(almost, {}, 0.1);

    expect(almost.ships.player.reload.starboard).toBeCloseTo(0.1, 5);
    expect(ready.ships.player.reload.starboard).toBe(0);
    expect(fireBroadside(ready, 'player', 'starboard').projectiles).toHaveLength(4);
  });
});

describe('ammunition consequences', () => {
  it.each([
    ['round', 0, { hull: 12, sails: 1, crew: 1, cannon: 2 }],
    ['chain', 0, { hull: 2, sails: 14, crew: 2, cannon: 0 }],
    ['grape', 0, { hull: 1, sails: 0, crew: 12, cannon: 0 }],
    ['round', 1, { hull: 9, sails: 1, crew: 1, cannon: 2 }],
    ['chain', 1, { hull: 1, sails: 6, crew: 1, cannon: 0 }],
    ['grape', 1, { hull: 0, sails: 0, crew: 2, cannon: 0 }],
  ] as const)(
    '%s at normalized range %d damages the intended system',
    (ammo, normalizedRange, want) => {
      expect(damageProfile(ammo, normalizedRange)).toEqual(want);
    },
  );

  it('turns damage into a surrender before every prize has to sink', () => {
    const state = createBattle({ seed: 9 });
    state.ships.enemy.hull = 19;
    const next = applyDamage(state, 'enemy', {
      hull: 0,
      sails: 0,
      crew: 30,
      cannon: 0,
    });

    expect(next.outcome).toEqual({ kind: 'surrender', victor: 'player' });
  });

  it('sinks a ship at zero hull even when it still has crew', () => {
    const state = createBattle({ seed: 10 });
    const next = applyDamage(state, 'enemy', {
      hull: 100,
      sails: 0,
      crew: 0,
      cannon: 0,
    });

    expect(next.outcome).toEqual({ kind: 'sunk', victor: 'player' });
  });
});

describe('battle boundaries and replay', () => {
  it('lets an outward-moving damaged enemy escape beyond the arena', () => {
    const state = createBattle({ seed: 27 });
    state.ships.enemy.position = { x: 81, z: 0 };
    state.ships.enemy.heading = Math.PI / 2;
    state.ships.enemy.hull = 40;

    const next = stepBattle(state, {}, 0.25);
    expect(next.outcome).toEqual({ kind: 'escaped', ship: 'enemy' });
  });

  it('freezes every simulation field while paused', () => {
    const state = createBattle({ seed: 31 });
    state.paused = true;
    const next = stepBattle(state, { player: { rudder: 1, fire: 'port' } }, 4);

    expect(next).toEqual(state);
  });

  it('replays the same command stream byte-for-byte from the same seed', () => {
    const commands: BattleCommand[] = [
      { player: { rudder: 1, sail: 'full' } },
      { player: { rudder: -0.4, ammo: 'chain', fire: 'port' } },
      { player: { rudder: 0, sail: 'reefed' }, enemy: { rudder: -1 } },
    ];
    const play = (): BattleState =>
      commands.reduce(
        (state, command) => stepBattle(state, command, 0.5),
        createBattle({ seed: 8675309 }),
      );

    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });
});
