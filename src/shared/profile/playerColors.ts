/**
 * The carnival's player palette: each player wears one of the landing page's
 * ticket colours, assigned by roster position so a player keeps their colour
 * everywhere (gate, booth, history) for as long as the roster order holds.
 */

const PLAYER_COLORS = ['#34e0c8', '#ff7ec0', '#a78bfa', '#ffd76a', '#e0405f', '#f6ead2'];

/** Roster position → colour. A ticket that vanished from the roster (index -1)
 * wears the first colour rather than none. */
export function playerColor(index: number): string {
  return PLAYER_COLORS[Math.max(0, index) % PLAYER_COLORS.length];
}
