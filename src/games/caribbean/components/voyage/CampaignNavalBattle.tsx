import { NavalBattlePage } from '../battle/NavalBattlePage';
import { useNavalSession } from '../../state/naval/useNavalSession';
import type { CaribbeanController } from '../../state/useCaribbean';
import '../../styles/battle.css';

export default function CampaignNavalBattle({ controller }: { controller: CaribbeanController }) {
  const mode = controller.journal?.state.mode;
  if (mode === undefined || mode.kind !== 'naval') {
    throw new Error('CampaignNavalBattle requires a saved naval campaign');
  }
  const session = useNavalSession(mode.input);
  return <NavalBattlePage session={session} />;
}
