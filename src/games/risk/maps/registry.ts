/**
 * The list of available Risk maps. Adding a map is a new module here — the
 * setup screen and board read from this list, nothing hard-codes "world".
 */

import type { RiskMapModule } from './types';
import { worldMap } from './world';

export const MAPS: RiskMapModule[] = [worldMap];

export const defaultMap = worldMap;

export function mapById(id: string): RiskMapModule {
  return MAPS.find((m) => m.id === id) ?? defaultMap;
}
