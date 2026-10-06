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
    ? 'It’s a tie'
    : iWon
      ? 'You win'
      : `${ctx.names[ctx.winner ?? 0]} wins`;
  const mine = ctx.scores[ctx.myIndex];
  // The wink is rare: only a close loss (three quarters of the coins) gets it.
  const sub =
    tie || iWon
      ? `You got ${ctx.target} coins first.`
      : mine >= ctx.target * 0.75
        ? `You got ${mine} coins. The crowd wants a rematch.`
        : `You got ${mine} coins.`;
  const order = ctx.looks.map((_, i) => i).sort((a, b) => ctx.scores[b] - ctx.scores[a]);
  return (
    <div className="racer-win" data-testid="racer-win">
      <div className="racer-win-card">
        {/* Decorative only — hidden entirely under reduced motion (racer.css). */}
        <div className="racer-confetti" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="racer-confetti-piece"
              style={{ '--i': i, '--d': `${(i % 8) * 0.18}s` } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="racer-win-arc" aria-hidden="true" />
        <h2>{title}</h2>
        <img className="racer-win-face" src={ctx.looks[ctx.winner ?? ctx.myIndex].portrait} alt="" />
        <p className="racer-win-sub">{sub}</p>
        <ol className="racer-win-table">
          {order.map((i, rank) => (
            <li key={i} className={i === ctx.myIndex ? 'me' : ''}>
              <span className="racer-win-rank">{rank + 1}</span>
              <img className="racer-win-row-face" src={ctx.looks[i].portrait} alt="" />
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
