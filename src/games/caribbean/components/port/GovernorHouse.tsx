import { BRIDGETOWN } from '../../content/campaign';
import type { CampaignStateV1 } from '../../domain/types';

function standingLabel(standing: number): string {
  if (standing > 0) return 'Favourable';
  if (standing < 0) return 'Strained';
  return 'Neutral';
}

export function GovernorHouse({ state }: { state: CampaignStateV1 }) {
  const controller = BRIDGETOWN.controller;
  const standing = state.standings[controller];
  const controllerLabel = `${controller[0]?.toUpperCase()}${controller.slice(1)}`;

  return (
    <div className="caribbean-port-stub caribbean-governor-house">
      <p className="caribbean-port-lede">
        <strong>{controllerLabel} control</strong> keeps the customs quay and harbour office under one flag.
      </p>
      <dl className="caribbean-port-facts">
        <div><dt>Standing</dt><dd>Standing: {standingLabel(standing)} ({standing})</dd></div>
        <div><dt>Diplomacy</dt><dd>Peace holds in Bridgetown.</dd></div>
        <div><dt>Commission</dt><dd>No commission offered today.</dd></div>
      </dl>
    </div>
  );
}
