import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import previewHtml from '../../../../preview-caribbean-game.html?raw';
import { manualNavalSession } from '../state/naval/testSession';
import { NavalBattlePage } from '../components/battle/NavalBattlePage';

const battleCss = readFileSync(resolve('src/games/caribbean/styles/battle.css'), 'utf8');
const phoneCss = battleCss.slice(battleCss.indexOf('@media (max-width: 600px)'));

describe('phone Battle Lab layout contracts', () => {
  it('keeps broadside paddles in a reserved normal-flow port-left/starboard-right row', () => {
    const session = manualNavalSession();
    render(<NavalBattlePage session={session} sceneFactory={null} />);
    const port = screen.getByTestId('naval-fire-port');
    const starboard = screen.getByTestId('naval-fire-starboard');

    expect(port.compareDocumentPosition(starboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(phoneCss).not.toMatch(/\.naval-fire-control\s*\{[^}]*position:\s*fixed/s);
    expect(phoneCss).toMatch(/\.naval-command-deck\s*\{[^}]*grid-template-areas:\s*"chart chart"\s*"port starboard"/s);
    expect(phoneCss).toMatch(/\.naval-fire-control--port\s*\{[^}]*grid-area:\s*port/s);
    expect(phoneCss).toMatch(/\.naval-fire-control--starboard\s*\{[^}]*grid-area:\s*starboard/s);
  });

  it('keeps the compact trade-wind reading visible on phone', () => {
    expect(phoneCss).not.toMatch(/\.naval-mission-line p:nth-child\(2\)\s*\{[^}]*display:\s*none/s);
  });

  it('requests the bundled SVG favicon instead of an implicit favicon.ico', () => {
    expect(previewHtml).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg" />');
  });
});
