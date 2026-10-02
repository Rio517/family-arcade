import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { LEVELS, makeProp } from '../domain/catalog';
import { createWorld } from '../domain/world';
import { feedbackFor, type Said } from './feedback';

const world = () => createWorld(seededRng(1), { name: 'Clara', skin: 0 }, [{ name: 'Big Gulp', skin: 1 }], { duration: 60, countdown: 0 });
const fresh = (): Said => ({ police: false, combo: false });

describe('feedback', () => {
  it("names what each new level lets you eat, all the way up the ladder, then 'Bigger and bigger!'", () => {
    const w = world();
    expect(feedbackFor({ type: 'level', hole: 0, level: 3 }, w, fresh())?.banner?.sub).toBe(`Now you can eat ${LEVELS[3].label.toLowerCase()}`);
    const top = LEVELS.length - 1;
    expect(feedbackFor({ type: 'level', hole: 0, level: top }, w, fresh())?.banner?.sub).toBe(`Now you can eat ${LEVELS[top].label.toLowerCase()}`);
    expect(feedbackFor({ type: 'level', hole: 0, level: LEVELS.length }, w, fresh())?.banner?.sub).toBe('Bigger and bigger!');
  });

  it("only the child's own gulps, levels and knocks are announced", () => {
    const w = world();
    const cone = makeProp(1, 'cone', 0, 0, 0);
    expect(feedbackFor({ type: 'eat', prop: cone, hole: 1, gained: 1 }, w, fresh())).toBeNull();
    expect(feedbackFor({ type: 'level', hole: 1, level: 4 }, w, fresh())).toBeNull();
    expect(feedbackFor({ type: 'hurt', hole: 1, cause: 'bomb' }, w, fresh())).toBeNull();
    expect(feedbackFor({ type: 'eat', prop: cone, hole: 0, gained: 1 }, w, fresh())?.cue).toBe('gulp');
  });

  it('warns of every attack coming for the child', () => {
    const w = world();
    for (const kind of ['tanker', 'tank', 'heli', 'bomber'] as const) {
      expect(feedbackFor({ type: 'incoming', target: 0, kind }, w, fresh())?.banner?.kind).toBe('warn');
    }
    expect(feedbackFor({ type: 'hurt', hole: 0, cause: 'tanker' }, w, fresh())?.banner?.text).toBe('Hot hot hot!');
    // An attack on a computer hole is news, so the child sees the city fights everyone.
    expect(feedbackFor({ type: 'incoming', target: 1, kind: 'tank' }, w, fresh())?.banner).toEqual({ kind: 'news', text: 'Tanks are after Big Gulp!' });
  });

  it('explains the points multiplier the first time it goes up in a round, then only plays the sound', () => {
    const w = world();
    const said = fresh();
    const first = feedbackFor({ type: 'combo', hole: 0, mult: 2 }, w, said);
    expect(first?.banner).toEqual({ kind: 'good', text: 'Gulp fast! Points x2', sub: 'Keep gulping for bigger points' });
    const later = feedbackFor({ type: 'combo', hole: 0, mult: 3 }, w, said);
    expect(later?.cue).toBe('power');
    expect(later?.banner).toBeUndefined();
    expect(feedbackFor({ type: 'combo', hole: 1, mult: 2 }, w, fresh())).toBeNull();
  });

  it('a swallow says whose and what it scored; a computer hole swallowing is not announced', () => {
    const w = world();
    expect(feedbackFor({ type: 'gulp', eater: 0, eaten: 1, points: 25 }, w, fresh())?.banner).toEqual({
      kind: 'good',
      text: 'You swallowed Big Gulp!',
      points: 25,
    });
    expect(feedbackFor({ type: 'gulp', eater: 1, eaten: 0, points: 25 }, w, fresh())).toBeNull();
  });

  it('says the police are coming once a round', () => {
    const w = world();
    const said = fresh();
    expect(feedbackFor({ type: 'police', x: 0, z: 0 }, w, said)?.banner?.text).toBe('Nee-naw! Police!');
    expect(feedbackFor({ type: 'police', x: 0, z: 0 }, w, said)).toBeNull();
  });
});
