import { useState } from 'react';
import { SKINS, skinById } from '../game/constants';
import { isUnlocked, type Profile } from '../state/profile';
import { InfoIcon, LockIcon, SkinGlyph } from './icons';

interface FleetSelectProps {
  profile: Profile;
  selectedSkinId: string;
  onSelect: (skinId: string) => void;
  onUnlock: (skinId: string) => boolean;
  onContinue: () => void;
}

/**
 * Screen 1 of setup: choose the look of your fleet. Free skins are always
 * available; premium skins are unlocked by spending points earned from wins.
 */
export function FleetSelect({ profile, selectedSkinId, onSelect, onUnlock, onContinue }: FleetSelectProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  function handlePick(id: string) {
    const skin = skinById(id);
    if (isUnlocked(profile, id)) {
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
            const owned = isUnlocked(profile, skin.id);
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
