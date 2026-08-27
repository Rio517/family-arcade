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

  it('uses one equal-height action-first command row with extra room for the shot cycle', () => {
    expect(battleCss).toMatch(/\.naval-command-strip\s*\{[^}]*--naval-command-height:\s*clamp\(82px,\s*14vh,\s*118px\)[^}]*grid-template-columns:\s*minmax\(96px,\s*1fr\) minmax\(128px,\s*1\.15fr\) minmax\(180px,\s*1\.42fr\) minmax\(130px,\s*1\.08fr\) minmax\(128px,\s*1\.15fr\) minmax\(96px,\s*1fr\)/s);
    expect(battleCss).toMatch(/\.naval-command-control,[\s\S]*\.naval-rudder-control\s*\{[^}]*height:\s*var\(--naval-command-height\)/s);
    expect(battleCss).toMatch(/\.naval-command-strip\s*\{[^}]*padding-bottom:\s*max\([^}]*env\(safe-area-inset-bottom\)/s);
    expect(battleCss).toMatch(/\.naval-hit-target\s*\{[^}]*min-height:\s*44px/s);
    expect(battleCss).toMatch(/\.naval-player-battery__bores\s*\{[^}]*grid-template-columns:\s*repeat\(8,\s*1fr\)/s);
    expect(battleCss).toMatch(/\.naval-fire-control__status\s*\{[^}]*font:\s*700 14px\/1/s);
    expect(battleCss).not.toMatch(/\.naval-shortcut-key\s*\{[^}]*display:\s*none/s);
    expect(battleCss).toMatch(/\.naval-command-control span,[\s\S]*\.naval-rudder-control span\s*\{[^}]*white-space:\s*normal[^}]*text-align:\s*center/s);
    expect(battleCss).not.toMatch(/\.naval-current-order\s*\{/s);
  });

  it('docks the app-wide Party control clear of campaign battle controls without hiding it', () => {
    expect(battleCss).toMatch(/body:has\(\.caribbean-production--campaign \.naval-battle-page\) \.party-root\s*\{[^}]*left:\s*max\(14px,[^}]*top:\s*max\(64px,[^}]*bottom:\s*auto[^}]*transform:\s*none[^}]*flex-direction:\s*column-reverse/s);
    expect(battleCss).not.toMatch(/body:has\(\.caribbean-production--campaign \.naval-battle-page\) \.party-root\s*\{[^}]*display:\s*none/s);
  });

  it.each([
    ['exact 960x600 boundary', 960, 600],
    ['1024x768 supported layout', 1024, 768],
  ])('keeps the visible Space / Esc action at least 14px at the %s', (_label, _width, _height) => {
    const pauseRule = battleCss.match(/\.naval-pause-control kbd\s*\{[^}]*font-size:\s*([\d.]+)px[^}]*\}/s);
    expect(pauseRule, 'pause shortcut must keep an explicit visible font-size').not.toBeNull();
    expect(Number(pauseRule?.[1])).toBeGreaterThanOrEqual(14);
  });

  it('keeps the required reload and not-saved notices at least 14px', () => {
    const noticeRule = battleCss.match(
      /\.campaign-naval-battle__restart-note,[\s\S]*?\.campaign-naval-battle__status\s*\{[^}]*font-size:\s*([\d.]+)(px|rem)[^}]*\}/s,
    );
    expect(noticeRule, 'campaign battle notices must declare a visible font-size').not.toBeNull();
    const declaredSize = Number(noticeRule?.[1]);
    const fontPx = noticeRule?.[2] === 'rem' ? declaredSize * 16 : declaredSize;
    expect(fontPx).toBeGreaterThanOrEqual(14);
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
