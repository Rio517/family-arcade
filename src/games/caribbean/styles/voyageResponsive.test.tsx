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
    const fontPixels = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));

    expect(css).toMatch(/\.caribbean-voyage\s*\{[^}]*min-height:\s*100dvh/s);
    expect(css).toMatch(/\.caribbean-voyage\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/padding:[^;]*env\(safe-area-inset-top\)[^;]*env\(safe-area-inset-right\)[^;]*env\(safe-area-inset-bottom\)[^;]*env\(safe-area-inset-left\)/s);
    expect(css).toMatch(/\.caribbean-voyage-action\s*\{[^}]*min-height:\s*44px/s);
    expect(fontPixels.length).toBeGreaterThan(0);
    expect(fontPixels.every((size) => size >= 14)).toBe(true);
    expect(css).toMatch(/\.caribbean-voyage-decision\s*\{[^}]*background:\s*#07151d/s);
    expect(css).toMatch(/\.caribbean-voyage-instrument\s*\{[^}]*background:\s*#0b3340/s);
    expect(css).toMatch(/\.caribbean-voyage-action:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--caribbean-trade-wind\)/s);
    expect(css).toMatch(/\.caribbean-voyage-wake\s*\{[^}]*stroke-dashoffset:\s*0/s);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*\.caribbean-voyage-wake[\s\S]*animation:/s);
    expect(css).not.toMatch(/@media\s*\([^)]*(?:orientation:\s*portrait|max-width)/s);
    expect(css).not.toContain('.caribbean-minimum-screen');
  });

  it('keeps voyage production source free of emoji and inaccessible SVG labels', () => {
    for (const filename of ['VoyageInstrument.tsx', 'SailingPage.tsx', 'EncounterPage.tsx']) {
      const source = readFileSync(resolve('src/games/caribbean/components/voyage', filename), 'utf8');
      expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
    const instrument = readFileSync(resolve('src/games/caribbean/components/voyage/VoyageInstrument.tsx'), 'utf8');
    expect(instrument).toMatch(/<svg[^>]*aria-hidden="true"/s);
    expect(instrument).not.toMatch(/<svg[^>]*(?:aria-label|<title)/s);
  });

  it('fits the desktop encounter chart and both full-surface choices in one viewport', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/voyage.css'), 'utf8');

    expect(css).toMatch(/\.caribbean-voyage--encounter\s*\{[^}]*height:\s*100dvh/s);
    expect(css).toMatch(/\.caribbean-encounter-decision\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.caribbean-voyage-choice > button\s*\{[^}]*min-height:\s*132px/s);
  });

  it('keeps the encounter alert and map fact labels above 4.5:1 contrast', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/voyage.css'), 'utf8');
    const mapBackground = css.match(/\.caribbean-map\s*\{[^}]*background:\s*(#[\da-f]{6})/s)?.[1];
    const factColor = css.match(/\.caribbean-map__facts dt\s*\{[^}]*color:\s*(#[\da-f]{6})/s)?.[1];
    const encounterBackground = css.match(/\.caribbean-voyage--encounter\s*\{[^}]*#[\da-f]{6};\s*\}/s)?.[0].match(/(#[\da-f]{6});\s*\}$/)?.[1];
    const alertColor = css.match(/\.caribbean-encounter-decision h1 span\s*\{[^}]*color:\s*(#[\da-f]{6})/s)?.[1];

    expect(mapBackground).toBeDefined();
    expect(factColor).toBeDefined();
    expect(encounterBackground).toBeDefined();
    expect(alertColor).toBeDefined();
    expect(contrastRatio(factColor!, mapBackground!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(alertColor!, encounterBackground!)).toBeGreaterThanOrEqual(4.5);
  });
});
