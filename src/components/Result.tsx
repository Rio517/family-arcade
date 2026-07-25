interface ResultProps {
  won: boolean;
  pointsEarned: number;
  totalPoints: number;
  oppName: string;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  onRematch: () => void;
  onExit: () => void;
}

export function Result({
  won,
  pointsEarned,
  totalPoints,
  oppName,
  iWantRematch,
  oppWantsRematch,
  onRematch,
  onExit,
}: ResultProps) {
  return (
    <div className="stack">
      <div className="panel">
        <div className="result-hero">
          <div className="subtle">{won ? 'Enemy fleet destroyed' : `${oppName} sank your fleet`}</div>
          <div className={`big ${won ? 'win' : 'loss'}`}>{won ? '🏆 Victory' : '💀 Defeat'}</div>
          <div className="earned">+{pointsEarned} points</div>
          <div className="subtle" style={{ marginTop: 6 }}>New balance: {totalPoints} pts</div>
        </div>
      </div>

      <div className="panel stack">
        {oppWantsRematch && !iWantRematch && (
          <p className="subtle center">🔁 {oppName} wants a rematch!</p>
        )}
        {iWantRematch && !oppWantsRematch && (
          <p className="subtle center">Waiting for {oppName} to accept the rematch…</p>
        )}
        <button className="btn btn-primary btn-lg btn-block" onClick={onRematch} disabled={iWantRematch} data-testid="rematch">
          {iWantRematch ? 'Rematch requested ✓' : '🔁 Rematch'}
        </button>
        <button className="btn btn-block" onClick={onExit} data-testid="exit">
          ← Back to menu
        </button>
      </div>
    </div>
  );
}
