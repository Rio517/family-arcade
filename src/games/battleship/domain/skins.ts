/**
 * Skin (fleet cosmetic) rules for Ship Battle, layered on the game-neutral
 * profile. The shared profile stores opaque unlocked ids; this module gives
 * them skin meaning — notably that free skins (cost 0) always count as owned.
 */

import { DEFAULT_UNLOCKED, skinById } from './constants';
import {
  isUnlocked as ownsCosmetic,
  selectSkin as selectCosmetic,
  unlockSkin as unlockCosmetic,
  type Profile,
} from '@shared/profile/profile';

/** Free skins are always available; paid skins must be unlocked. */
export function isSkinUnlocked(profile: Profile, skinId: string): boolean {
  return skinById(skinId).cost === 0 || ownsCosmetic(profile, skinId);
}

/** The skin to show when the player hasn't chosen one yet. */
export function defaultSkinId(): string {
  return DEFAULT_UNLOCKED[0];
}

/** The player's current skin, falling back to the default free one. */
export function currentSkinId(profile: Profile): string {
  return profile.lastSkinId || defaultSkinId();
}

/** Select a skin if it's owned (or free); otherwise leave the profile as-is. */
export function selectSkin(profile: Profile, skinId: string): Profile {
  return isSkinUnlocked(profile, skinId) ? selectCosmetic(profile, skinId) : profile;
}

/**
 * Buy a skin with points. Returns the updated profile (with the skin selected),
 * or null if it's already owned or unaffordable.
 */
export function buySkin(profile: Profile, skinId: string): Profile | null {
  const bought = unlockCosmetic(profile, skinId, skinById(skinId).cost);
  return bought ? selectCosmetic(bought, skinId) : null;
}
