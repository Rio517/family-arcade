/**
 * Rainbow Racer — what a racer who can't fly rides on. A princess or a bunny
 * picks one of these; the fairy and the unicorn fly by themselves. Kept apart
 * from the 3D code so the setup screens and the wire can name a ride without
 * loading three.js.
 */

export type MountId = 'cloud' | 'bird' | 'unicorn';

export const MOUNT_IDS: readonly MountId[] = ['cloud', 'bird', 'unicorn'];

export const isMountId = (v: unknown): v is MountId => (MOUNT_IDS as readonly unknown[]).includes(v);
