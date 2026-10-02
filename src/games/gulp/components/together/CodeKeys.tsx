/**
 * INSERT CODE: four tiles and big tap-keys for the 23 code letters, a delete
 * key and GO!. A hardware keyboard types too (letters, Backspace, Enter); I,
 * L, O and digits are never in a code, so they are ignored. GO! wakes up at
 * four letters. Escape goes back.
 */
import '../../styles/together.css';
import { useEffect, useRef, useState } from 'react';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { BackButton, CODE_LETTERS, DelIcon, Tiles } from './parts';
import { useFocusOnOpen } from './useFocusOnOpen';

const KEYS = CODE_LETTERS.split('');
const isCodeLetter = (k: string) => k.length === 1 && KEYS.includes(k);

/** Keys typed into a field elsewhere (the party's own panel) are not for the tiles. */
const inField = (t: EventTarget | null) => t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]') !== null;

export function CodeKeys({
  onCode,
  onBack,
  busy = false,
  error = null,
}: {
  onCode(code: string): void;
  onBack(): void;
  busy?: boolean;
  error?: string | null;
}) {
  const [code, setCode] = useState('');
  const ref = useFocusOnOpen<HTMLElement>();
  useDismissOnEscape(true, onBack);
  const full = code.length === 4;

  // The keyboard listener reads the latest letters and props from here.
  const now = useRef({ code, busy, onCode });
  useEffect(() => {
    now.current = { code, busy, onCode };
  });

  const press = (k: string) => {
    if (busy) return;
    if (k === 'DEL') setCode((c) => c.slice(0, -1));
    else if (isCodeLetter(k)) setCode((c) => (c.length < 4 ? c + k : c));
  };
  const go = () => {
    if (!busy && full) onCode(code);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || inField(e.target)) return;
      if (now.current.busy) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        setCode((c) => c.slice(0, -1));
        return;
      }
      if (e.key === 'Enter') {
        // A focused button answers Enter itself (GO! or a letter key).
        if (e.target instanceof Element && e.target.closest('button, a')) return;
        const { code: typed, onCode: send } = now.current;
        if (typed.length === 4) {
          e.preventDefault();
          send(typed);
        }
        return;
      }
      if (e.key.length !== 1) return;
      const k = e.key.toUpperCase();
      if (!isCodeLetter(k)) return;
      e.preventDefault();
      setCode((c) => (c.length < 4 ? c + k : c));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={`gulp-tg gulp-tg-screen gulp-tg-codekeys${busy ? ' busy' : ''}`}
      aria-label="Insert code"
      data-testid="gulp-code"
    >
      <div className="gulp-tg-col gulp-tg-psel">
        <div className="gulp-tg-top">
          <BackButton onBack={onBack} testId="gulp-code-back" />
          <h2 className="gulp-tg-sign purple">INSERT CODE</h2>
        </div>
        <Tiles code={code} cursor label={code ? `Letters ${code.split('').join(' ')}` : 'No letters typed yet'} testId="gulp-code-tiles" />
        <p className="gulp-tg-hint">Ask your friend for the four letters on their screen.</p>
        <div className="gulp-tg-keys" role="group" aria-label="Letters">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className="gulp-tg-key"
              aria-disabled={busy || undefined}
              onClick={() => press(k)}
              data-testid={`gulp-code-key-${k}`}
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            className="gulp-tg-key del"
            aria-label="Delete"
            aria-disabled={busy || undefined}
            onClick={() => press('DEL')}
            data-testid="gulp-code-del"
          >
            <DelIcon size={26} />
          </button>
        </div>
        <button
          type="button"
          className="gulp-tg-ab y big go"
          disabled={!full}
          aria-disabled={busy || undefined}
          onClick={go}
          data-testid="gulp-code-go"
        >
          {busy ? 'Joining…' : 'GO!'}
        </button>
        {error && (
          <p className="gulp-tg-err" role="alert" data-testid="gulp-code-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
