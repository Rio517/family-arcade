import { beforeEach, describe, expect, it } from 'vitest';
import { loadProfile, saveProfile } from './profileStore';
import { defaultProfile } from './profile';

beforeEach(() => {
  localStorage.clear();
});

describe('profile persistence', () => {
  it('round-trips a profile', () => {
    const p = { ...defaultProfile(), name: 'Rio', points: 350 };
    saveProfile(p);
    expect(loadProfile()).toEqual(p);
  });

  it('returns a default profile when nothing is stored', () => {
    expect(loadProfile()).toEqual(defaultProfile());
  });

  it('recovers from corrupt JSON', () => {
    localStorage.setItem('bship:profile:v1', '{not json');
    expect(loadProfile()).toEqual(defaultProfile());
  });
});
