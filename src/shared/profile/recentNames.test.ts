import { describe, expect, it, beforeEach } from 'vitest';
import { getRecentNames, nameSuggestions, rememberName } from './recentNames';

beforeEach(() => localStorage.clear());

describe('recentNames', () => {
  it('remembers names most-recent first', () => {
    rememberName('Kai');
    rememberName('Sam');
    expect(getRecentNames()).toEqual(['Sam', 'Kai']);
  });

  it('de-dupes case-insensitively and moves the repeat to the front', () => {
    rememberName('Kai');
    rememberName('Sam');
    rememberName('kai');
    expect(getRecentNames()).toEqual(['kai', 'Sam']);
  });

  it('trims and caps at five', () => {
    ['  Kai  ', 'Sam', 'Bo', 'Ada', 'Ivy', 'Max'].forEach(rememberName);
    const recent = getRecentNames();
    expect(recent).toHaveLength(5);
    expect(recent[recent.length - 1]).toBe('Sam'); // Kai fell off the end
    expect(recent).not.toContain('Kai');
    expect(recent[0]).toBe('Max');
  });

  it('ignores blank names', () => {
    rememberName('   ');
    expect(getRecentNames()).toEqual([]);
  });

  it('blends recent names ahead of the regulars, de-duped and capped', () => {
    rememberName('Rio'); // also a regular — must not appear twice
    rememberName('Kai');
    const out = nameSuggestions(['Rio', 'Klara', 'Flora', 'Mommy', 'Papa']);
    expect(out[0]).toBe('Kai'); // most recent first
    expect(out).toContain('Rio');
    expect(out.filter((n) => n.toLowerCase() === 'rio')).toHaveLength(1);
    expect(out.length).toBeLessThanOrEqual(6);
  });

  it('survives a corrupt store', () => {
    localStorage.setItem('arcade.recentNames', '{not json');
    expect(getRecentNames()).toEqual([]);
    expect(() => rememberName('Kai')).not.toThrow();
    expect(getRecentNames()).toEqual(['Kai']);
  });
});
