import { useState } from 'react';
import { SKINS, skinById } from '@games/battleship/domain/constants';
import { isSkinUnlocked } from '@games/battleship/domain/skins';
import type { Profile } from '@shared/profile/profile';
import { InfoIcon, LockIcon, SkinGlyph } from '@shared/ui/icons';

interface FleetSelectProps {
  profile: Profile;
  selectedSkinId: string;
  name: string;
  onName: (name: string) => void;
  onSelect: (skinId: string) => void;
  onUnlock: (skinId: string) => boolean;
  onContinue: () => void;
}

/**
 * Screen 1 of setup: set your captain's name and choose the look of your fleet.
 * Both are editable here (and any change is announced to a connected opponent).
 * Free skins are always available; premium skins are unlocked by spending points.
 */
export function FleetSelect({ profile, selectedSkinId, name, onName, onSelect, onUnlock, onContinue }: FleetSelectProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  function handlePick(id: string) {
    const skin = skinById(id);
    if (isSkinUnlocked(profile, id)) {
      onSelect(id);
      return;
    }
    if (profile.points < skin.cost) {
      flash(`Need ${skin.cost - profile.points} more points to unlock ${skin.name}`);
      return;
    }
    if (onUnlock(id)) flash(`${skin.name} unlocked!`);
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2>Captain’s name</h2>
        <div className="field">
          <label htmlFor="captain-name">Shown to your opponent</label>
          <input
            id="captain-name"
            value={name}
            maxLength={20}
            placeholder="Captain"
            onChange={(e) => onName(e.target.value)}
            data-testid="fleet-name-input"
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Choose your fleet</h2>
          <button
            type="button"
            className="info-btn"
            onClick={() => setShowInfo((v) => !v)}
            aria-expanded={showInfo}
            data-testid="fleet-info"
          >
            <InfoIcon size={16} /> How fleets work
          </button>
        </div>

        {showInfo && (
          <div className="info-box" data-testid="fleet-info-box">
            <p>
              Fleets are <strong>cosmetic</strong> — they change how your ships look on the board (their colour and
              emblem), not how the game plays.
            </p>
            <p>Both captains always get the same ships and the same rules, so every match is fair.</p>
            <p>Win games to earn points, then spend them here to unlock fancier-looking fleets.</p>
          </div>
        )}

        <div className="stats" style={{ marginBottom: 14 }}>
          <div className="stat points">
            <span className="k">Points</span>
            <span className="v">{profile.points}</span>
          </div>
        </div>

        <div className="skins">
          {SKINS.map((skin) => {
            const owned = isSkinUnlocked(profile, skin.id);
            const selected = selectedSkinId === skin.id;
            return (
              <button
                key={skin.id}
                type="button"
                className="skin"
                data-selected={selected}
                data-locked={!owned}
                style={{ ['--skin' as string]: skin.color }}
                onClick={() => handlePick(skin.id)}
                data-testid={`skin-${skin.id}`}
              >
                {!owned && (
                  <span className="lockpill">
                    <LockIcon size={15} />
                  </span>
                )}
                <div className="glyph">
                  <SkinGlyph id={skin.id} size={26} style={{ color: 'var(--skin)' }} />
                </div>
                <div className="nm">{skin.name}</div>
                <div className="bl">{skin.blurb}</div>
                {owned ? (
                  <div className="cost owned">{selected ? 'Selected' : 'Owned'}</div>
                ) : (
                  <div className="cost locked">{skin.cost} pts</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <button className="btn btn-primary btn-lg btn-block" onClick={onContinue} data-testid="fleet-continue">
        Deploy the {skinById(selectedSkinId).name} →
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
