import { createRoot } from 'react-dom/client';
import '@shared/styles/tokens.css';
import './styles/caribbean-poc.css';
import { BattlePoc } from './components/BattlePoc';

createRoot(document.getElementById('root')!).render(
  <div className="app cc-app">
    <BattlePoc />
  </div>,
);
