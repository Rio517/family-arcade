import { HashRouter, Route, Routes } from 'react-router-dom';
import { Menu } from './Menu';
import { Privacy } from './Privacy';
import { GAMES } from './registry';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { PartyProvider } from '@shared/party/PartyContext';
import { PartyBar } from '@shared/party/PartyBar';
import { FloatingVideo } from '@shared/party/FloatingVideo';
import { PlayerGate } from '@shared/profile/PlayerGate';

/** The party pill says "Klara opened Chess" without shared code knowing any
 * game: the registry stays the only list (ADR 0002). */
function resolveGame(id: string) {
  const game = GAMES.find((g) => g.id === id);
  return game ? { title: game.title, path: game.path } : null;
}

/** The whole arcade shell — routes plus the cross-game party layer. */
export function App() {
  return (
    // HashRouter keeps deep links working on GitHub Pages with no server config.
    <HashRouter>
      <ErrorBoundary>
        {/* The party — connection + names + opt-in video — lives above the routes
            so it survives moving between games (even into a different game). */}
        <PartyProvider resolveGame={resolveGame}>
          {/* Every routed page lives in the one main landmark; display:contents
              in app.css keeps it out of the layout entirely. */}
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Menu />} />
              <Route path="/privacy" element={<Privacy />} />
              {GAMES.map((game) => (
                <Route
                  key={game.id}
                  path={game.path}
                  element={
                    // The ticket booth at the game door: asks who's playing
                    // only when nobody is signed in on this browser.
                    <PlayerGate gameTitle={game.title}>
                      <game.Page />
                    </PlayerGate>
                  }
                />
              ))}
            </Routes>
          </main>
          {/* The party panel can send you to play with the camera effects
              alone — the Magic Mirror, if the registry has it. */}
          <PartyBar soloEffects={resolveGame('mirror')} />
          <FloatingVideo />
        </PartyProvider>
      </ErrorBoundary>
    </HashRouter>
  );
}
