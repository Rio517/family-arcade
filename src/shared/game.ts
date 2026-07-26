/**
 * The contract every game module exposes to the umbrella app.
 *
 * The app (menu + router) knows games *only* through this descriptor, and the
 * registry is the single list of them — so adding or removing a game is one
 * folder plus one line in the registry, with no other app code to touch.
 */

import type { ComponentType } from 'react';

export interface GameDescriptor {
  /** Stable id. */
  id: string;
  /** Menu title, e.g. "Ship Battle". */
  title: string;
  /** Optional pill next to the title, e.g. "2-Player". */
  tag?: string;
  /** Route path, e.g. "/play". */
  path: string;
  /** One-line menu blurb. */
  description: string;
  /** Menu icon. */
  Icon: ComponentType<{ size?: number }>;
  /** The full-screen game page. */
  Page: ComponentType;
}
