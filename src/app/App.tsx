import { HashRouter, Route, Routes } from 'react-router-dom';
import { Menu } from './Menu';
import { Privacy } from './Privacy';
import { GAMES } from './registry';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { PartyProvider } from '@shared/party/PartyContext';
import { PartyBar } from '@shared/party/PartyBar';
import { FloatingVideo } from '@shared/party/FloatingVideo';

/** The whole arcade shell — routes plus the cross-game party layer. */
export function App() {
  return (
    // HashRouter keeps deep links working on GitHub Pages with no server config.
    <HashRouter>
      <ErrorBoundary>
        {/* The party — connection + names + opt-in video — lives above the routes
            so it survives moving between games (even into a different game). */}
        <PartyProvider>
          {/* Every routed page lives in the one main landmark; display:contents
              in app.css keeps it out of the layout entirely. */}
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Menu />} />
              <Route path="/privacy" element={<Privacy />} />
              {GAMES.map((game) => (
                <Route key={game.id} path={game.path} element={<game.Page />} />
              ))}
            </Routes>
          </main>
          <PartyBar />
          <FloatingVideo />
        </PartyProvider>
      </ErrorBoundary>
    </HashRouter>
  );
}
