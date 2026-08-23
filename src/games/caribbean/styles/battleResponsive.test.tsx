import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import previewHtml from '../../../../preview-caribbean-game.html?raw';
const battleCss = readFileSync(resolve('src/games/caribbean/styles/battle.css'), 'utf8');

describe('full-bleed Battle Lab layout contracts', () => {
  it('makes the tactical viewport an edge-to-edge stage beneath pointer-safe overlays', () => {
    expect(battleCss).toMatch(/\.naval-battle-page\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*overflow:\s*hidden/s);
    expect(battleCss).toMatch(/\.naval-battle-stage\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/s);
    expect(battleCss).toMatch(/\.naval-battle-overlay\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*pointer-events:\s*none/s);
    expect(battleCss).toMatch(/\.naval-command-strip\s*\{[^}]*pointer-events:\s*auto/s);
    expect(battleCss).not.toMatch(/\.naval-command-deck\s*\{[^}]*grid-template-columns:\s*clamp\(92px/s);
  });

  it('uses one compact landscape command row with safe-area padding and touch-sized controls', () => {
    expect(battleCss).toMatch(/\.naval-command-strip\s*\{[^}]*grid-template-columns:[^}]*repeat\(3,/s);
    expect(battleCss).toMatch(/\.naval-command-strip\s*\{[^}]*padding-bottom:\s*max\([^}]*env\(safe-area-inset-bottom\)/s);
    expect(battleCss).toMatch(/\.naval-hit-target\s*\{[^}]*min-height:\s*44px/s);
    expect(battleCss).toMatch(/\.naval-fire-control\s*\{[^}]*min-height:\s*56px/s);
    expect(battleCss).not.toMatch(/\.naval-fire-control\s*\{[^}]*min-height:\s*(?:9[0-9]|1[0-9]{2,})px/s);
    expect(battleCss).not.toMatch(/\.naval-shortcut-key\s*\{[^}]*display:\s*none/s);
    expect(battleCss).toMatch(/\.naval-command-control span,[\s\S]*\.naval-rudder-control span\s*\{[^}]*white-space:\s*normal[^}]*text-align:\s*center/s);
  });

  it('keeps semantic wind and the minimum-display notice visible rather than hiding live controls', () => {
    expect(battleCss).not.toMatch(/\.naval-mission-line[^}]*display:\s*none/s);
    expect(battleCss).toMatch(/\.caribbean-display-notice\s*\{/s);
    expect(battleCss).toMatch(/\.naval-viewport-fallback__actions\s*\{[^}]*top:\s*calc\(50% \+ 88px\)/s);
  });

  it('requests the bundled SVG favicon instead of an implicit favicon.ico', () => {
    expect(previewHtml).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg" />');
  });
});
