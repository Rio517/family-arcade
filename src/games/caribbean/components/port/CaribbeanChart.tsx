import { RED_JACKDAW_VOYAGE } from '../../content/voyage';
import { redJackdawView } from '../../domain/leadSelectors';
import type { CampaignStateV1 } from '../../domain/types';

export function CaribbeanChart({ state }: { state: CampaignStateV1 }) {
  const lead = redJackdawView(state);
  const courseMarked = lead.status !== 'available';
  const flagship = state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
  const routeStatus = lead.status === 'completed' ? 'completed' : lead.status;
  const statusCopy = lead.status === 'available'
    ? 'No course marked'
    : lead.status === 'completed'
      ? 'Lead complete'
      : lead.status === 'expired'
        ? 'Rumour expired'
        : 'Course marked';

  return (
    <section className="caribbean-chart" aria-label="Caribbean chart">
      <div className="caribbean-chart__heading">
        <span>Caribbean chart</span>
        <strong>{statusCopy}</strong>
      </div>
      <div className="caribbean-chart__drawing">
        <svg viewBox="0 0 620 350" aria-hidden="true" focusable="false">
          <defs>
            <pattern id="caribbean-chart-grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0V44" />
            </pattern>
            <filter id="caribbean-chart-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect className="caribbean-chart__grid" x="0" y="0" width="620" height="350" />
          <path className="caribbean-chart__island caribbean-chart__island--barbados" d="M114 235c-9-31 5-59 20-76 12 11 18 32 14 53-4 22-18 43-30 52-3-9-3-19-4-29Z" />
          <path className="caribbean-chart__shoal" d="M69 302c74-19 150-12 226-32 74-20 138-61 254-42" />
          {courseMarked && (
            <path
              className="caribbean-chart__route"
              data-chart-route="red-jackdaw"
              data-route-status={routeStatus}
              d="M143 205C231 187 314 140 459 112"
            />
          )}
          <g className="caribbean-chart__location" data-chart-location="bridgetown" transform="translate(143 205)">
            <circle r="6" />
            <path d="M-17 0H17M0-17V17" />
          </g>
          <g className="caribbean-chart__ship" transform="translate(180 187) rotate(76)">
            <path d="M-15 8 0-19 15 8 0 15Z" />
            <path d="M0-16V11" />
          </g>
          {courseMarked && (
            <g className="caribbean-chart__contact" data-chart-location="red-jackdaw" transform="translate(459 112)" filter="url(#caribbean-chart-glow)">
              <path d="M0-12 12 0 0 12-12 0Z" />
              <circle r="3" />
            </g>
          )}
          <g className="caribbean-chart__compass" transform="translate(536 267)">
            <circle r="42" />
            <path d="M0-34 7 0 0 34-7 0Z" />
            <path d="M-34 0H34" />
          </g>
        </svg>
        <span className="caribbean-chart__label caribbean-chart__label--port">Bridgetown</span>
        <span className="caribbean-chart__label caribbean-chart__label--ship">{flagship?.name ?? 'Flagship'}</span>
        {courseMarked && <span className="caribbean-chart__label caribbean-chart__label--contact">Red Jackdaw</span>}
      </div>
      <dl className="caribbean-chart__facts">
        <div><dt>Bearing</dt><dd>{courseMarked ? RED_JACKDAW_VOYAGE.bearingLabel : 'Awaiting a marked rumour'}</dd></div>
        <div><dt>Wind</dt><dd>{RED_JACKDAW_VOYAGE.windLabel}</dd></div>
      </dl>
    </section>
  );
}
