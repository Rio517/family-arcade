import { describe, expect, it } from 'vitest';
import { buySkin, currentSkinId, defaultSkinId, isSkinUnlocked, selectSkin } from './skins';
import { defaultProfile } from '@shared/profile/profile';

describe('skins', () => {
  it('treats free skins as always unlocked', () => {
    expect(isSkinUnlocked(defaultProfile(), 'aqua')).toBe(true); // free
    expect(isSkinUnlocked(defaultProfile(), 'void')).toBe(false); // paid, not owned
  });

  it('falls back to the default free skin when none chosen', () => {
    expect(currentSkinId(defaultProfile())).toBe(defaultSkinId());
    expect(currentSkinId({ ...defaultProfile(), lastSkinId: 'ember' })).toBe('ember');
  });

  it('buySkin deducts points, unlocks, and selects', () => {
    const rich = { ...defaultProfile(), points: 500 };
    const after = buySkin(rich, 'void'); // cost 300
    expect(after).not.toBeNull();
    expect(after!.points).toBe(200);
    expect(isSkinUnlocked(after!, 'void')).toBe(true);
    expect(after!.lastSkinId).toBe('void');
  });

  it('buySkin refuses when unaffordable', () => {
    expect(buySkin(defaultProfile(), 'void')).toBeNull();
  });

  it('selectSkin only selects owned or free skins', () => {
    expect(selectSkin(defaultProfile(), 'void').lastSkinId).not.toBe('void'); // not owned
    expect(selectSkin(defaultProfile(), 'ember').lastSkinId).toBe('ember'); // free
  });
});
