import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Menu } from './components/Menu';
import { BattleshipPage } from './components/BattleshipPage';
import { ChessPage } from './components/ChessPage';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    {/* HashRouter keeps deep links working on GitHub Pages with no server config. */}
    <HashRouter>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/play" element={<BattleshipPage />} />
        <Route path="/chess" element={<ChessPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
