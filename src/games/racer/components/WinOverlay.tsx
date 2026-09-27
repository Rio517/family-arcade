/**
 * The end-of-race card: who won, everyone's coins, and Race again / Menu.
 * In a one-player race a rival can win; the card says so kindly and shows
 * how close it was.
 */
import type { RaceCtx } from './Track3D';

export function WinOverlay({ ctx, onAgain, onMenu }: { ctx: RaceCtx; onAgain: () => void; onMenu: () => void }) {
  const iWon = ctx.winner === ctx.myIndex;
  const tie = ctx.mode === 'net' && ctx.winner === null;
  const title = tie
    ? 'A tie! You both win!'
    : iWon
      ? 'You win!'
      : `${ctx.names[ctx.winner ?? 0]} wins!`;
  const sub = tie || iWon ? `You got ${ctx.target} coins first.` : `So close — you got ${ctx.scores[ctx.myIndex]} coins.`;
  const order = ctx.looks.map((_, i) => i).sort((a, b) => ctx.scores[b] - ctx.scores[a]);
  return (
    <div className="racer-win" data-testid="racer-win">
      <div className="racer-win-card">
        <h2>{title}</h2>
        <div className="racer-win-face">{ctx.looks[ctx.winner ?? ctx.myIndex].emoji}</div>
        <p className="racer-win-sub">{sub}</p>
        <ol className="racer-win-table">
          {order.map((i) => (
            <li key={i} className={i === ctx.myIndex ? 'me' : ''}>
              <span>{ctx.looks[i].emoji}</span>
              <span className="racer-win-name">{i === ctx.myIndex ? 'You' : ctx.names[i]}</span>
              <b>{ctx.scores[i]}</b>
            </li>
          ))}
        </ol>
        <p className="racer-win-time">Time: {ctx.elapsed.toFixed(1)}s</p>
        <div className="racer-win-btns">
          <button className="racer-primary" onClick={onAgain} data-testid="racer-again">Race again</button>
          <button className="racer-ghost" onClick={onMenu} data-testid="racer-win-menu">Menu</button>
        </div>
      </div>
    </div>
  );
}
