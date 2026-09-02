/**
 * The Ticket Booth on the arcade's front page: shows who's signed in on this
 * browser with their tickets and record, their game history across every
 * game, and the roster moves — switch (or add) a player, edit the profile.
 * Switching is the same ticket list as the gate and every lobby's "Change":
 * tap a stub, or type a name to filter or make a new ticket. Replaces the old
 * Prize Counter, whose numbers were one anonymous pile per device.
 */

import { useState } from 'react';
import { useProfile } from '@shared/profile/useProfile';
import { useIdentity } from '@shared/profile/useIdentity';
import { playerColor } from '@shared/profile/playerColors';
import { initialOf } from '@shared/profile/tickets';
import { PlayerPicker } from '@shared/profile/PlayerPicker';
import { pronounCodePointLength, type GameHistoryEntry } from '@shared/profile/profile';
import { arcadeNow } from '@shared/time/clock';
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
  const { users, active, signIn, newPlayer, setName } = useIdentity();
  // Display reads `active.profile`; useProfile is only here for pronouns.
  const { setPronouns } = useProfile();
  const [mode, setMode] = useState<'view' | 'switch' | 'edit-profile'>('view');
  const [draftName, setDraftName] = useState('');
  const [draftPronouns, setDraftPronouns] = useState('');
  const [pronounsError, setPronounsError] = useState(false);
  // Sampled once per mount — "today" flipping to "yest." mid-visit isn't
  // worth an impure read on every render.
  const [now] = useState(arcadeNow);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draftName.trim();
    if (!clean) return;
    setName(clean);
    setPronouns(draftPronouns);
    setDraftName('');
    setDraftPronouns('');
    setPronounsError(false);
    setMode('view');
  };

  const changePronouns = (value: string) => {
    if (pronounCodePointLength(value) <= 24) {
      setDraftPronouns(value);
      setPronounsError(false);
      return;
    }
    setPronounsError(true);
  };

  return (
    <section className="prize booth" aria-label="Ticket booth">
      <div className="prize-in">
        <div className="prize-h">✦ Ticket Booth ✦</div>

        {active ? (
          <>
            <div
              className="pstub booth-hero"
              style={{ '--c': playerColor(users.indexOf(active)) } as React.CSSProperties}
            >
              <span className="pmedal" aria-hidden="true">{initialOf(active.profile.name)}</span>
              <span className="pstub-body">
                <span className="pstub-name">{active.profile.name}</span>
                <span className="pstub-pronouns">{active.profile.pronouns}</span>
                <span className="pstub-stats">
                  <b>{active.profile.points}</b> tickets · {active.profile.wins} W · {active.profile.losses} L
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
                data-testid="booth-edit-profile"
                className={mode === 'edit-profile' ? 'on' : ''}
                onClick={() => {
                  setDraftName(active.profile.name);
                  setDraftPronouns(active.profile.pronouns);
                  setPronounsError(false);
                  setMode(mode === 'edit-profile' ? 'view' : 'edit-profile');
                }}
              >
                Edit profile
              </button>
            </div>

            {mode === 'switch' && (
              <PlayerPicker
                users={users}
                activeId={active.id}
                testIdPrefix="booth"
                onPick={(id) => {
                  signIn(id);
                  setMode('view');
                }}
                onCreate={(name) => {
                  newPlayer(name);
                  setMode('view');
                }}
                onClose={() => setMode('view')}
              />
            )}

            {mode === 'edit-profile' && (
              <form className="booth-form" onSubmit={submit}>
                <label htmlFor="booth-profile-name">Name</label>
                <div className="booth-form-fields">
                  <input
                    id="booth-profile-name"
                    data-testid="booth-profile-name"
                    value={draftName}
                    maxLength={20}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Name"
                  />
                  <label htmlFor="booth-pronouns">Pronouns</label>
                  <input
                    id="booth-pronouns"
                    data-testid="booth-profile-pronouns"
                    value={draftPronouns}
                    aria-describedby={pronounsError ? 'booth-pronouns-error' : undefined}
                    onChange={(e) => changePronouns(e.target.value)}
                    placeholder="Pronouns"
                  />
                  {pronounsError && (
                    <p id="booth-pronouns-error" className="booth-form-error" role="alert">
                      Use 24 characters or fewer
                    </p>
                  )}
                </div>
                <div className="booth-form-row">
                  <button type="submit" data-testid="booth-profile-save">
                    Save profile
                  </button>
                </div>
              </form>
            )}

            {active.profile.history.length > 0 && mode === 'view' && (
              <ul className="booth-thread" data-testid="booth-history">
                {active.profile.history.slice(0, HISTORY_SHOWN).map((entry, i) => (
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
