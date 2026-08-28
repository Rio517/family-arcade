import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/../g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('strategic voyage responsive and accessibility CSS', () => {
  it('removes the production grid before voyage composition', () => {
    const productionCss = readFileSync(resolve('src/games/caribbean/styles/production.css'), 'utf8');
    expect(productionCss).not.toContain('8.333% 100%');
    expect(productionCss).not.toMatch(/linear-gradient\(90deg[^;]+1px[^;]+1px/s);
  });

  it('enforces voyage responsive floors', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/voyage.css'), 'utf8');
    const mapCss = readFileSync(resolve('src/games/caribbean/styles/map.css'), 'utf8');
    const fontPixels = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));

    expect(css).toMatch(/\.caribbean-voyage\s*\{[^}]*min-height:\s*100dvh/s);
    expect(css).toMatch(/\.caribbean-voyage\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/padding:[^;]*env\(safe-area-inset-top\)[^;]*env\(safe-area-inset-right\)[^;]*env\(safe-area-inset-bottom\)[^;]*env\(safe-area-inset-left\)/s);
    expect(css).toMatch(/\.caribbean-voyage-action\s*\{[^}]*min-height:\s*44px/s);
    expect(fontPixels.length).toBeGreaterThan(0);
    expect(fontPixels.every((size) => size >= 14)).toBe(true);
    expect(css).toMatch(/\.caribbean-sailing-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(330px, 27vw\)/s);
    expect(css).toMatch(/\.caribbean-voyage-decision\s*\{[^}]*background:\s*linear-gradient/s);
    expect(css).toMatch(/\.caribbean-voyage-action:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--caribbean-trade-wind\)/s);
    expect(mapCss).toMatch(/\.caribbean-map--maplibre \.caribbean-map__controls button[\s\S]*min-height:\s*44px/s);
    expect(mapCss).toMatch(/\.caribbean-map--maplibre\.caribbean-map--port \.caribbean-map__masthead strong\s*\{[^}]*font-size:\s*clamp\(13px, 1\.1vw, 16px\)/s);
    expect(mapCss).toMatch(/\.caribbean-map__marker--contact\s*\{[^}]*flex-direction:\s*row-reverse/s);
    expect(mapCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/s);
    expect(css).not.toContain('.caribbean-minimum-screen');
  });

  it('keeps voyage and map production source free of emoji and names noninteractive chart markers', () => {
    for (const filename of ['SailingPage.tsx', 'EncounterPage.tsx']) {
      const source = readFileSync(resolve('src/games/caribbean/components/voyage', filename), 'utf8');
      expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
    const map = [
      readFileSync(resolve('src/games/caribbean/components/map/CaribbeanMap.tsx'), 'utf8'),
      readFileSync(resolve('src/games/caribbean/components/map/CaribbeanMapRenderer.tsx'), 'utf8'),
    ].join('\n');
    expect(map).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(map).toMatch(/element\.setAttribute\('aria-label', label\)/);
    expect(map).toMatch(/element\.setAttribute\('role', 'img'\)/);
    expect(map).toMatch(/element\.removeAttribute\('tabindex'\)/);
  });

  it('fits the desktop encounter chart and both full-surface choices in one viewport', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/voyage.css'), 'utf8');

    expect(css).toMatch(/\.caribbean-voyage--encounter\s*\{[^}]*height:\s*100dvh/s);
    expect(css).toMatch(/\.caribbean-encounter-decision\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.caribbean-voyage-choice > button\s*\{[^}]*min-height:\s*132px/s);
    expect(css).toMatch(/@media \(max-width:\s*1100px\), \(max-height:\s*700px\)[\s\S]*\.caribbean-encounter-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 34vw\)/s);
    expect(css).not.toMatch(/@media \(width <= 980px\)[\s\S]*\.caribbean-voyage--encounter\s*\{[^}]*height:\s*auto/s);
  });

  it('keeps the encounter alert and map footer labels above 4.5:1 contrast', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/voyage.css'), 'utf8');
    const mapCss = readFileSync(resolve('src/games/caribbean/styles/map.css'), 'utf8');
    const footerBackground = mapCss.match(/\.caribbean-map--maplibre \.caribbean-map__footer\s*\{[^}]*background:\s*rgb\([^;]+\);/s) ? '#d2be8e' : undefined;
    const footerColor = mapCss.match(/\.caribbean-map--maplibre \.caribbean-map__footer dd\s*\{[^}]*color:\s*(#[\da-f]{6})/s)?.[1];
    const encounterBackground = css.match(/\.caribbean-voyage--encounter\s*\{[^}]*#[\da-f]{6};\s*\}/s)?.[0].match(/(#[\da-f]{6});\s*\}$/)?.[1];
    const alertColor = css.match(/\.caribbean-encounter-decision h1 span\s*\{[^}]*color:\s*(#[\da-f]{6})/s)?.[1];

    expect(footerBackground).toBeDefined();
    expect(footerColor).toBeDefined();
    expect(encounterBackground).toBeDefined();
    expect(alertColor).toBeDefined();
    expect(contrastRatio(footerColor!, footerBackground!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(alertColor!, encounterBackground!)).toBeGreaterThanOrEqual(4.5);
  });
});
