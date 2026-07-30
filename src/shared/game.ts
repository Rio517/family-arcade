/**
 * The contract every game module exposes to the umbrella app.
 *
 * The app (menu + router) knows games *only* through this descriptor, and the
 * registry is the single list of them — so adding or removing a game is one
 * folder plus one line in the registry, with no other app code to touch.
 */

import type { ComponentType } from 'react';

/**
 * One resumable save a game wants shown in the landing page's Save Station.
 * The menu renders each summary as a `.np-row` link with
 * `data-testid="resume-<key>"` and the game's accent colour on `--np-c`.
 */
export interface SavedGameSummary {
  /** Stable row key; the menu derives the testid `resume-<key>` from it. */
  key: string;
  /** Route to resume the game, e.g. "/chess?resume=local". */
  to: string;
  /** Accent colour for the row (`--np-c`). */
  color: string;
  /** Row icon (rendered at size 20). */
  Icon: ComponentType<{ size?: number }>;
  /** First line, e.g. "Chess — Alice vs Bob". */
  title: string;
  /** Second line, e.g. "same device · 3 moves in". */
  meta: string;
}

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
  /**
   * Saves the family can jump back into right now, for the Save Station.
   * Optional — games without persistence just omit it. Called on every menu
   * render, so it should be a cheap synchronous storage read.
   */
  savedGames?: () => SavedGameSummary[];
}
