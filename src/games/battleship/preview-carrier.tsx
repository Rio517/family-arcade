/**
 * Blender-authored **carrier** inspector — see preview-ship.tsx for the component.
 *
 * A page per ship so each can be opened and compared side by side, rather than
 * juggling query strings. Dev-only: built solely under BUILD_HARNESS.
 */
import { createRoot } from 'react-dom/client';
import { Inspector } from './preview-ship';

createRoot(document.getElementById('root')!).render(<Inspector ship="carrier" />);
