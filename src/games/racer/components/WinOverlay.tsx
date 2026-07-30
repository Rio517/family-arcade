/**
 * The end-of-race celebration card: winner (or tie) headline, the finishing
 * scores or solo time, and the Race again / Menu buttons.
 */
import type { RaceCtx } from './Track3D';

export function WinOverlay({ ctx, onAgain, onMenu }: { ctx: RaceCtx; onAgain: () => void; onMenu: () => void }) {
  const iWon = ctx.winner === ctx.myIndex;
  const soloWin = ctx.mode === 'solo';
  const title = soloWin
    ? `You got all ${ctx.target} coins!`
    : iWon
      ? 'You win! 🏆'
      : `${ctx.names[ctx.winner ?? 0]} wins!`;
  return (
    <div className="racer-win" data-testid="racer-win">
      <div className="racer-win-card">
        <div className="racer-win-burst" aria-hidden="true">🎉✨🏆✨🎉</div>
        <h2>{title}</h2>
        <div className="racer-win-face">{ctx.looks[ctx.winner ?? ctx.myIndex].emoji}</div>
        {ctx.mode === 'net' ? (
          <p className="racer-win-time">
            {ctx.names[0]}: {ctx.scores[0]} 🪙 · {ctx.names[1]}: {ctx.scores[1]} 🪙
          </p>
        ) : (
          <p className="racer-win-time">Your time: <b>{ctx.elapsed.toFixed(1)}s</b> ⏱</p>
        )}
        <div className="racer-win-btns">
          <button className="racer-primary" onClick={onAgain} data-testid="racer-again">Race again</button>
          <button className="racer-ghost" onClick={onMenu} data-testid="racer-win-menu">Menu</button>
        </div>
      </div>
    </div>
  );
}
