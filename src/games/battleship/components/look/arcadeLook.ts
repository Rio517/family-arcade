import type { LookId } from '@games/battleship/state/pitch';

/** One of the darker-arcade looks under review (today's screens are not one). */
export type ArcadeLook = Exclude<LookId, 'today'>;

/** The look to dress a start screen in, or null for today's screens. */
export function arcadeLook(look: LookId | undefined): ArcadeLook | null {
  return look && look !== 'today' ? look : null;
}
