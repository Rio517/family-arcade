/**
 * The camera-effect catalogue (ADR 0010). Eager and tiny — pages render
 * pickers from this list; the actual scenes live in the lazy overlay chunk.
 */
import type { ComponentType } from 'react';
import { DragonIcon, PeaceHandIcon } from '@shared/ui/icons';

export type EffectId = 'dragon' | 'peace';

export interface EffectInfo {
  id: EffectId;
  name: string;
  /** Kid-facing one-liner: how do I make it do the thing? */
  hint: string;
  Icon: ComponentType<{ size?: number }>;
}

export const EFFECTS: EffectInfo[] = [
  {
    id: 'dragon',
    name: 'Fire Dragon',
    hint: 'Wear the dragon — open your mouth wide to breathe fire!',
    Icon: DragonIcon,
  },
  {
    id: 'peace',
    name: 'Peace Magic',
    hint: 'Flash a peace sign and rainbow stars burst out!',
    Icon: PeaceHandIcon,
  },
];
