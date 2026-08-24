import type { GameDescriptor, SavedGameSummary } from '@shared/game';
import { ShipIcon } from '@shared/ui/icons';

import { CaribbeanPage } from './components/CaribbeanPage';
import { formatCaribbeanSaveSummary } from './state/selectors';
import { loadCampaign } from './storage/persistence';

function savedGames(): SavedGameSummary[] {
  try {
    const loaded = loadCampaign(window.localStorage);
    if (
      loaded.kind !== 'loaded'
      || loaded.recovered
      || loaded.unreadableSlots.length > 0
    ) return [];
    return [{
      key: 'caribbean',
      to: '/caribbean?resume=1',
      color: '#4ec5c1',
      Icon: ShipIcon,
      ...formatCaribbeanSaveSummary(loaded.journal.state),
    }];
  } catch {
    return [];
  }
}

export const caribbean: GameDescriptor = {
  id: 'caribbean',
  title: 'Caribbean Career',
  tag: '3D battles',
  players: { min: 1, max: 1 },
  computer: true,
  path: '/caribbean',
  description: 'Trade, chase rumours, and command a growing fleet across the Caribbean.',
  Icon: ShipIcon,
  Page: CaribbeanPage,
  savedGames,
};
