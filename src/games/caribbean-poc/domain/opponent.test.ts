import { createBattle, normalizeAngle, stepBattle, type BattleState } from './battle';
import { opponentCommand } from './opponent';

function broadsideSetup(playerX: number): BattleState {
  const state = createBattle({ seed: 88 });
  state.ships.enemy.position = { x: 0, z: 0 };
  state.ships.enemy.heading = Math.PI;
  state.ships.player.position = { x: playerX, z: 0 };
  return state;
}

describe('opponentCommand', () => {
  it('fires the loaded port battery when the player crosses physical port', () => {
    expect(opponentCommand(broadsideSetup(-24))).toMatchObject({
      ammo: 'round',
      fire: 'port',
    });
  });

  it('fires the loaded starboard battery when the player crosses physical starboard', () => {
    expect(opponentCommand(broadsideSetup(24))).toMatchObject({
      ammo: 'round',
      fire: 'starboard',
    });
  });

  it('does not request a battery that is still reloading', () => {
    const state = broadsideSetup(24);
    state.ships.enemy.reload.starboard = 2;

    expect(opponentCommand(state).fire).toBeUndefined();
  });

  it('uses chain shot while the player still has useful sails', () => {
    const state = broadsideSetup(-16);
    state.ships.player.sails = 75;
    state.ships.player.hull = 95;

    expect(opponentCommand(state).ammo).toBe('chain');
  });

  it('turns away under heavy damage instead of fighting to automatic destruction', () => {
    const state = broadsideSetup(-18);
    state.ships.enemy.hull = 30;
    state.ships.enemy.sails = 42;

    const command = opponentCommand(state);
    expect(command.sail).toBe('full');
    expect(command.fire).toBeUndefined();
    expect(Math.abs(command.rudder ?? 0)).toBeGreaterThan(0.2);
  });

  it('turns to seek a broadside when the player is ahead', () => {
    const state = createBattle({ seed: 44 });
    const command = opponentCommand(state);

    expect(Math.abs(command.rudder ?? 0)).toBeGreaterThan(0.2);
    expect(command.sail).toBe('reefed');
  });

  it('steps closer to the intended broadside heading', () => {
    const state = createBattle({ seed: 44 });
    const intendedBroadsideHeading = Math.PI / 2;
    const angularError = (heading: number) =>
      Math.abs(normalizeAngle(heading - intendedBroadsideHeading));

    const next = stepBattle(state, { enemy: opponentCommand(state) }, 0.5);

    expect(angularError(next.ships.enemy.heading)).toBeLessThan(
      angularError(state.ships.enemy.heading),
    );
  });
});
