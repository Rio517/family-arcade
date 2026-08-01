import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Menu } from './Menu';
import { Privacy } from './Privacy';
import { GAMES } from './registry';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { PartyProvider } from '@shared/party/PartyContext';
import { PartyBar } from '@shared/party/PartyBar';
import { FloatingVideo } from '@shared/party/FloatingVideo';
import '@shared/styles/tokens.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    {/* HashRouter keeps deep links working on GitHub Pages with no server config. */}
    <HashRouter>
      <ErrorBoundary>
        {/* The party — connection + names + opt-in video — lives above the routes
            so it survives moving between games (even into a different game). */}
        <PartyProvider>
          <Routes>
            <Route path="/" element={<Menu />} />
            <Route path="/privacy" element={<Privacy />} />
            {GAMES.map((game) => (
              <Route key={game.id} path={game.path} element={<game.Page />} />
            ))}
          </Routes>
          <PartyBar />
          <FloatingVideo />
        </PartyProvider>
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
);
