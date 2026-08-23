/**
 * The Ticket Booth on the arcade's front page: shows who's signed in on this
 * browser with their tickets and record, their game history across every
 * game, and the roster moves — switch player, rename, new player. Replaces
 * the old Prize Counter, whose numbers were one anonymous pile per device.
 */

import { useState } from 'react';
import { useProfile } from '@shared/profile/useProfile';
import { useUsers } from '@shared/profile/useUsers';
import { playerColor } from '@shared/profile/playerColors';
import type { GameHistoryEntry } from '@shared/profile/profile';
import { GAMES } from './registry';
import '@shared/profile/player.css';

const HISTORY_SHOWN = 8;

function gameTitle(id: string): string {
  return GAMES.find((g) => g.id === id)?.title ?? 'Game';
}

/** today / yesterday / "Aug 21" — short enough for a stub. */
function whenLabel(ts: number, now: number): string {
  if (!ts) return '';
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yest.';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function HistoryRow({ entry, now }: { entry: GameHistoryEntry; now: number }) {
  const won = entry.result === 'win';
  return (
    <li className="booth-used">
      <span className="booth-when">{whenLabel(entry.finishedAt, now)}</span>
      <span className="booth-what">
        <span className="booth-game">{gameTitle(entry.game)}</span>
        <span className="booth-foe">vs {entry.opponent}</span>
      </span>
      <span className={`booth-pts ${won ? 'w' : 'l'}`}>
        {won ? 'WIN' : 'LOSS'} +{entry.pointsEarned}
      </span>
    </li>
  );
}

export function PlayerBooth() {
  const { users, active, signIn, newPlayer } = useUsers();
  const { profile, setName } = useProfile();
  const [mode, setMode] = useState<'view' | 'switch' | 'rename' | 'new'>('view');
  const [draft, setDraft] = useState('');
  // Sampled once per mount — "today" flipping to "yest." mid-visit isn't
  // worth an impure read on every render.
  const [now] = useState(() => Date.now());

  const activeIndex = users.findIndex((u) => u.id === active?.id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    if (mode === 'rename') setName(clean);
    if (mode === 'new') newPlayer(clean);
    setDraft('');
    setMode('view');
  };

  return (
    <section className="prize booth" aria-label="Ticket booth">
      <div className="prize-in">
        <div className="prize-h">✦ Ticket Booth ✦</div>

        {active ? (
          <>
            <div
              className="pstub booth-hero"
              style={{ '--c': playerColor(activeIndex) } as React.CSSProperties}
            >
              <span className="pmedal" aria-hidden="true">
                {[...active.profile.name.trim()][0]?.toUpperCase() ?? '?'}
              </span>
              <span className="pstub-body">
                <span className="pstub-name">{active.profile.name}</span>
                <span className="pstub-stats">
                  <b>{profile.points}</b> tickets · {profile.wins} W · {profile.losses} L
                </span>
              </span>
              <span className="pstub-admit" aria-hidden="true">ADMIT ONE</span>
            </div>

            <div className="booth-actions">
              <button
                type="button"
                data-testid="booth-switch"
                className={mode === 'switch' ? 'on' : ''}
                onClick={() => setMode(mode === 'switch' ? 'view' : 'switch')}
              >
                Switch player
              </button>
              <button
                type="button"
                data-testid="booth-rename"
                className={mode === 'rename' ? 'on' : ''}
                onClick={() => {
                  setDraft(active.profile.name);
                  setMode(mode === 'rename' ? 'view' : 'rename');
                }}
              >
                Rename
              </button>
              <button
                type="button"
                data-testid="booth-new"
                className={mode === 'new' ? 'on' : ''}
                onClick={() => {
                  setDraft('');
                  setMode(mode === 'new' ? 'view' : 'new');
                }}
              >
                New player
              </button>
            </div>

            {mode === 'switch' && (
              <div className="booth-roster">
                {users
                  .filter((u) => u.id !== active.id)
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="pstub"
                      style={{ '--c': playerColor(users.indexOf(u)) } as React.CSSProperties}
                      data-testid={`booth-user-${u.id}`}
                      onClick={() => {
                        signIn(u.id);
                        setMode('view');
                      }}
                    >
                      <span className="pmedal" aria-hidden="true">
                        {[...u.profile.name.trim()][0]?.toUpperCase() ?? '?'}
                      </span>
                      <span className="pstub-body">
                        <span className="pstub-name">{u.profile.name}</span>
                        <span className="pstub-stats">
                          <b>{u.profile.points}</b> tickets · {u.profile.wins} wins
                        </span>
                      </span>
                      <span className="pstub-admit" aria-hidden="true">ADMIT ONE</span>
                    </button>
                  ))}
                {users.length === 1 && (
                  <p className="booth-empty">Nobody else has a ticket yet — add a new player.</p>
                )}
              </div>
            )}

            {(mode === 'rename' || mode === 'new') && (
              <form className="booth-form" onSubmit={submit}>
                <label htmlFor="booth-name">
                  {mode === 'rename' ? 'New name' : 'Who joins the arcade?'}
                </label>
                <div className="booth-form-row">
                  <input
                    id="booth-name"
                    data-testid="booth-name"
                    value={draft}
                    maxLength={20}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Name"
                  />
                  <button type="submit" data-testid="booth-save">
                    {mode === 'rename' ? 'Save' : 'Make ticket'}
                  </button>
                </div>
              </form>
            )}

            {profile.history.length > 0 && mode === 'view' && (
              <ul className="booth-thread" data-testid="booth-history">
                {profile.history.slice(0, HISTORY_SHOWN).map((entry, i) => (
                  <HistoryRow key={`${entry.finishedAt}-${i}`} entry={entry} now={now} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="booth-empty">
            Nobody's signed in — pick up your ticket at any game door, and your points and
            history follow you to every game.
          </p>
        )}
      </div>
    </section>
  );
}
