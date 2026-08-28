import type { CampaignJournal } from './events';
import { validateJournal } from './replay';

export function compactJournal(journal: CampaignJournal): CampaignJournal {
  const validation = validateJournal(journal);
  if (!validation.ok) {
    throw new Error(`Invalid campaign journal: ${validation.issues.map(({ path, code }) => `${path}:${code}`).join(', ')}`);
  }
  return {
    initial: structuredClone(validation.value.state),
    events: [],
    state: structuredClone(validation.value.state),
  };
}
