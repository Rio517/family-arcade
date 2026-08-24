import { RED_JACKDAW_VOYAGE } from '../../content/voyage';

export function VoyageInstrument({ phase }: { phase: 'sailing' | 'encounter' }) {
  const wake = phase === 'encounter'
    ? 'M90 238 C190 220 282 226 379 173'
    : 'M270 266 C374 250 478 257 599 231';
  const sloopTransform = phase === 'encounter' ? 'translate(380 50)' : 'translate(600 108)';
  return (
    <section
      className="caribbean-voyage-instrument"
      data-testid="voyage-instrument"
      data-phase={phase}
      aria-label="Voyage instrument"
    >
      <div className="caribbean-voyage-instrument__facts">
        <p>Bridgetown to Red Jackdaw contact</p>
        <dl>
          <div><dt>Bearing</dt><dd>{RED_JACKDAW_VOYAGE.bearingLabel}</dd></div>
          <div><dt>Wind</dt><dd>{RED_JACKDAW_VOYAGE.windLabel}</dd></div>
          <div><dt>Passage</dt><dd>1 day · 1 provision outbound</dd></div>
        </dl>
        {phase === 'encounter' && <p>Contact sighted on the east-by-north course.</p>}
      </div>
      <svg viewBox="0 0 760 320" aria-hidden="true" focusable="false">
        <path className="caribbean-voyage-sea" d="M22 240 C150 216 244 257 366 232 S584 205 738 234" />
        <path className="caribbean-voyage-wake" d={wake} />
        <g className="caribbean-voyage-sloop" transform={sloopTransform}>
          <path d="M-55 112 L68 112 L43 143 L-22 143 Z" />
          <path d="M0 111 V6" />
          <path d="M4 16 L62 91 L4 91 Z" />
          <path d="M-4 32 L-45 94 L-4 94 Z" />
        </g>
        {phase === 'encounter' && <circle className="caribbean-voyage-contact" cx="540" cy="125" r="9" />}
      </svg>
    </section>
  );
}
