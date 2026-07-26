import type { GameDescriptor } from '@shared/game';
import { GlobeIcon } from '@shared/ui/icons';
import { RiskPage } from './components/RiskPage';

export const risk: GameDescriptor = {
  id: 'risk',
  title: 'Risk',
  tag: '2–6 Players',
  path: '/risk',
  description: 'World conquest on one shared board. Reinforce, attack with dice, and take over the map.',
  Icon: GlobeIcon,
  Page: RiskPage,
};
