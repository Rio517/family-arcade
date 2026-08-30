import type { GameDescriptor, SavedGameSummary } from '@shared/game';
import preview from './assets/preview.webp';
import { GlobeIcon } from '@shared/ui/icons';
import { RiskPage } from './components/RiskPage';
import { loadRiskGame } from './storage/riskPersistence';

/** The Save Station row for the family's in-progress campaign, if any. */
function savedGames(): SavedGameSummary[] {
  const risk = loadRiskGame();
  if (!risk) return [];
  return [{
    key: 'risk',
    to: '/risk',
    color: '#e0705a',
    Icon: GlobeIcon,
    title: `Risk — ${risk.state.players.map((p) => p.name).join(', ')}`,
    meta: `campaign · ${risk.state.players.length} generals`,
  }];
}

export const risk: GameDescriptor = {
  id: 'risk',
  title: 'Risk',
  players: { min: 2, max: 6 },
  seats: { min: 2, max: 6 },
  computer: true,
  path: '/risk',
  preview: {
    image: preview,
    facts: ['2–6 players', 'One iPad, passed around', 'A long evening'],
    blurb:
      'World conquest on one shared board: reinforce, roll the dice, take the map. Computer generals fill the empty chairs.',
  },
  description: 'World conquest on one shared board. Reinforce, attack with dice, and take over the map.',
  Icon: GlobeIcon,
  Page: RiskPage,
  savedGames,
};
