import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Menu } from './Menu';
import { GAMES } from './registry';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import '@shared/styles/tokens.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    {/* HashRouter keeps deep links working on GitHub Pages with no server config. */}
    <HashRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Menu />} />
          {GAMES.map((game) => (
            <Route key={game.id} path={game.path} element={<game.Page />} />
          ))}
        </Routes>
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
);
