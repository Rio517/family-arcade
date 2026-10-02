import { describe, expect, it } from 'vitest';
import { SKINS } from '../components/skins';
import { isGulpMsg, type RoundSettings } from './protocol';

const settings: RoundSettings = { map: 'city', difficulty: 'medium', duration: 240, powerups: true, fightBack: false };
const seat = (name: string, human = true) => ({ name, skin: 1, human });

describe('Gulp wire protocol', () => {
  it('knows every skin there is', () => {
    expect(isGulpMsg({ t: 'pick', skin: SKINS.length - 1 })).toBe(true);
    expect(isGulpMsg({ t: 'pick', skin: SKINS.length })).toBe(false);
  });

  it('accepts the joining messages', () => {
    expect(isGulpMsg({ t: 'hello', name: 'Klara', skin: 0, token: 'a1b2', inRound: false })).toBe(true);
    expect(isGulpMsg({ t: 'lobby', settings, children: [seat('Klara'), seat('Rio')] })).toBe(true);
    expect(isGulpMsg({ t: 'start', seed: 12345, settings, wonders: ['irontower'], seats: [seat('Klara'), seat('Rio'), seat('Big Gulp', false)], you: 1 })).toBe(true);
    expect(isGulpMsg({ t: 'ready' })).toBe(true);
    expect(isGulpMsg({ t: 'pos', seq: 3, x: 1234, z: -560, vx: 12, vz: 0 })).toBe(true);
    expect(isGulpMsg({ t: 'over', order: [2, 0, 1] })).toBe(true);
    expect(isGulpMsg({ t: 'again' })).toBe(true);
  });

  it('turns away anything malformed or out of range', () => {
    expect(isGulpMsg(null)).toBe(false);
    expect(isGulpMsg({ t: 'nope' })).toBe(false);
    expect(isGulpMsg({ t: 'hello', name: 'x'.repeat(500), skin: 0, token: 't', inRound: false })).toBe(false);
    expect(isGulpMsg({ t: 'lobby', settings: { ...settings, map: 'moon' }, children: [seat('Klara')] })).toBe(false);
    expect(isGulpMsg({ t: 'lobby', settings, children: Array.from({ length: 5 }, (_, i) => seat(`k${i}`)) })).toBe(false);
    // The host is seat 0: a guest is told a seat from 1 to 3, inside the seat list.
    expect(isGulpMsg({ t: 'start', seed: 1, settings, wonders: [], seats: [seat('Klara'), seat('Rio')], you: 0 })).toBe(false);
    expect(isGulpMsg({ t: 'start', seed: 1, settings, wonders: [], seats: [seat('Klara'), seat('Rio')], you: 2 })).toBe(false);
    expect(isGulpMsg({ t: 'start', seed: 1, settings, wonders: ['moonbase'], seats: [seat('Klara'), seat('Rio')], you: 1 })).toBe(false);
    // Positions travel as whole hundredths.
    expect(isGulpMsg({ t: 'pos', seq: 3, x: 12.5, z: 0, vx: 0, vz: 0 })).toBe(false);
    expect(isGulpMsg({ t: 'pos', seq: 3, x: Infinity, z: 0, vx: 0, vz: 0 })).toBe(false);
    expect(isGulpMsg({ t: 'over', order: [99] })).toBe(false);
  });
});
