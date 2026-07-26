/**
 * The list of games the console offers. This is the ONE place that references
 * each game module — add or remove a game here (plus its folder) and the menu
 * and router update themselves. Nothing else in the app hard-codes a game.
 */

import type { GameDescriptor } from '@shared/game';
import { battleship } from '@games/battleship';
import { chess } from '@games/chess';
import { risk } from '@games/risk';

export const GAMES: GameDescriptor[] = [battleship, chess, risk];
