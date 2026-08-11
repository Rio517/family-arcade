import { useState } from 'react';
import { SKINS, skinById } from '@games/battleship/domain/constants';
import { isSkinUnlocked } from '@games/battleship/domain/skins';
import type { FleetEra } from '@games/battleship/domain/types';
import type { Profile } from '@shared/profile/profile';
import { InfoIcon, LockIcon, SkinGlyph } from '@shared/ui/icons';

interface FleetSelectProps {
  profile: Profile;
  selectedSkinId: string;
  /** Which navy this captain sails in 3D; a separate choice from the colour. */
  era: FleetEra;
  onEra: (era: FleetEra) => void;
  name: string;
  onName: (name: string) => void;
  onSelect: (skinId: string) => void;
  onUnlock: (skinId: string) => boolean;
  onContinue: () => void;
}

/** The two navies, spelled out so every captain knows what they're picking. */
const ERAS: { id: FleetEra; name: string; sub: string; ships: string }[] = [
  {
    id: 'classic',
    name: 'Classic',
    sub: 'The great warships of 1942',
    ships: 'Shōkaku · Iowa · Cleveland · U-boat · Fletcher',
  },
  {
    id: 'modern',
    name: 'Modern',
    sub: 'Today’s navy',
    ships: 'Ford · Kirov · Type 055 · Virginia · Hobart',
  },
];

/**
 * Screen 1 of setup: set your captain's name and choose the look of your fleet.
 * Both are editable here (and any change is announced to a connected opponent).
 * Free skins are always available; premium skins are unlocked by spending points.
 */
export function FleetSelect({ profile, selectedSkinId, era, onEra, name, onName, onSelect, onUnlock, onContinue }: FleetSelectProps) {
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

  // One compact panel — name, colours, navy, deploy — sized to fit a tablet
  // screen without scrolling. Three stacked panels used to run ~2300px tall.
  return (
    <div className="stack fleet-setup">
      <div className="panel">
        <div className="fleet-top">
          <div className="field fleet-name">
            <label htmlFor="captain-name">Captain’s name — shown to your opponent</label>
            <input
              id="captain-name"
              value={name}
              maxLength={20}
              placeholder="Captain"
              onChange={(e) => onName(e.target.value)}
              data-testid="fleet-name-input"
            />
          </div>
          <div className="fleet-points">
            <span className="k">Points</span>
            <span className="v">{profile.points}</span>
          </div>
        </div>

        <div className="fleet-sect">
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
                    <SkinGlyph id={skin.id} size={20} style={{ color: 'var(--skin)' }} />
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

        <div className="fleet-sect">
          <h2>Choose your navy</h2>
          <p className="subtle era-note">
            Which ships sail for you in the 3D view. Every captain picks their own —
            classic and modern fleets can battle each other.
          </p>
          <div className="eras" role="group" aria-label="Fleet era">
            {ERAS.map((e) => (
              <button
                key={e.id}
                type="button"
                className="era-card"
                data-selected={era === e.id}
                aria-pressed={era === e.id}
                onClick={() => onEra(e.id)}
                data-testid={`era-${e.id}`}
              >
                <div className="era-name">{e.name}</div>
                <div className="era-sub">{e.sub}</div>
                <div className="era-ships">{e.ships}</div>
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-lg btn-block" onClick={onContinue} data-testid="fleet-continue">
          Deploy the {skinById(selectedSkinId).name} →
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
