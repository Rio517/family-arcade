/**
 * Magic Mirror — the solo home of the camera effects (ADR 0010). Opening the
 * page opens the mirror: the camera starts straight away and you see yourself
 * wearing the dragon. Everything runs on this device: the stream goes into a
 * local <video> and is never recorded, stored, or sent anywhere.
 *
 * The effects live in a panel over the glass rather than under it, so the
 * mirror keeps the room it needs on a tablet in landscape.
 */
import '../styles/mirror.css';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { EffectsOverlay } from '@shared/effects/EffectsOverlay';
import { EFFECTS, type EffectId } from '@shared/effects/effects';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { CameraIcon, ChevronDownIcon, CloseIcon, SparkleIcon, WarningIcon } from '@shared/ui/icons';

type Phase = 'starting' | 'live' | 'denied';

export function MirrorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>('starting');
  const [selected, setSelected] = useState<EffectId[]>(['dragon']);
  // Open to begin with on a screen with room for it: it says what the mirror
  // can do and where the camera goes, and one tap clears it off the glass. A
  // phone's glass is too small to share, so there it waits behind its button.
  const [showControls, setShowControls] = useState(
    () => typeof matchMedia !== 'function' || matchMedia('(min-width: 700px)').matches,
  );
  // The overlay needs the actual element (it hands it to the tracker), so the
  // video lands in state via callback ref rather than a RefObject.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // The camera's own shape, once it starts. The frame is cut to match it so
  // nothing is cropped and the effects land where the face really is.
  const [aspect, setAspect] = useState<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Asks for the camera and reports back; the phase it started from is the
  // caller's business, so opening on mount touches no state until the camera
  // has actually answered.
  const openMirror = useCallback(async () => {
    try {
      const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
      if (!media?.getUserMedia) throw new Error('no camera on this device');
      const stream = await media.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setPhase('live');
    } catch {
      // Refused, or a browser that wants a tap before it hands over a camera:
      // either way the door below opens it.
      setPhase('denied');
    }
  }, []);

  // The mirror opens with the page. Leaving it releases the camera light.
  useEffect(() => {
    void openMirror();
    return stopCamera;
  }, [openMirror]);

  useEffect(() => {
    if (videoEl && streamRef.current) videoEl.srcObject = streamRef.current;
  }, [videoEl]);

  useDismissOnEscape(showControls, () => setShowControls(false));

  // Back where you came from: the mirror opens from the arcade, and from the
  // party panel mid-game. `key` is 'default' only when this page is where the
  // session started — with nothing behind it, the arcade is the way out.
  const leave = () => {
    stopCamera();
    if (location.key === 'default') navigate('/');
    else navigate(-1);
  };

  const readAspect = (e: SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth > 0 && v.videoHeight > 0) setAspect(v.videoWidth / v.videoHeight);
  };

  const toggle = (id: EffectId) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const live = phase === 'live';
  // Both ways round, so the frame can be fitted to width or to height with
  // multiplication alone (dividing by a custom property is younger than iPad
  // Safari 16, which this still has to run on).
  const stageStyle = aspect
    ? ({ '--mirror-aspect': aspect, '--mirror-aspect-inv': 1 / aspect } as CSSProperties)
    : undefined;
  const hints = EFFECTS.filter((e) => selected.includes(e.id)).map((e) => e.hint);

  return (
    <div className={live ? 'app mirror is-live' : 'app mirror'}>
      <header className="mirror-head">
        <h1>Magic Mirror</h1>
        {live ? (
          <button className="back-link mirror-close" data-testid="mirror-close" onClick={leave}>
            <CloseIcon size={16} />
            Close
          </button>
        ) : (
          <Link className="back-link" to="/">
            Family game console
          </Link>
        )}
      </header>

      {!live && (
        <section className="mirror-card">
          {phase === 'denied' ? (
            <>
              <p className="mirror-error" data-testid="mirror-error">
                <WarningIcon size={18} /> The mirror needs the camera to work. Check the camera
                permission for this site, then try again.
              </p>
              <button
                className="btn mirror-open"
                data-testid="mirror-start"
                onClick={() => {
                  setPhase('starting');
                  void openMirror();
                }}
              >
                <CameraIcon size={20} />
                Try again
              </button>
            </>
          ) : (
            <p className="subtle" data-testid="mirror-opening">
              Opening the mirror…
            </p>
          )}
        </section>
      )}

      {live && (
        <section className="mirror-live">
          {/* Whatever space the header leaves: the glass is cut to fit inside
              it, so a short landscape window never scrolls. */}
          <div className="mirror-fit">
            <div className="mirror-stage" style={stageStyle}>
              <video
                data-testid="mirror-video"
                ref={setVideoEl}
                onLoadedMetadata={readAspect}
                autoPlay
                playsInline
                muted
                aria-label="Your mirror — live camera view"
              />
              <EffectsOverlay video={videoEl} effects={selected} />

              {/* The effects, on the glass. Closed it is one button in the
                  corner; open it fills the right-hand side. */}
              <div className={showControls ? 'mirror-panel is-open' : 'mirror-panel'}>
                {showControls && (
                  <div className="mirror-panel-body" id="mirror-effects-panel">
                    <div className="mirror-chips" role="group" aria-label="Effects">
                      {EFFECTS.map(({ id, name, Icon }) => (
                        <button
                          key={id}
                          className="mirror-chip"
                          data-testid={`effect-toggle-${id}`}
                          aria-pressed={selected.includes(id)}
                          onClick={() => toggle(id)}
                        >
                          <Icon size={20} />
                          {name}
                          <span className="mirror-beta">beta</span>
                        </button>
                      ))}
                    </div>

                    <p className="mirror-hints">
                      {hints.length > 0 ? hints.join(' ') : 'Pick an effect to start the magic.'}
                    </p>

                    {selected.length > 0 && (
                      <p className="mirror-beta-note" data-testid="mirror-beta-note">
                        These effects are brand new and still in testing — they might wobble a bit
                        while we tune them!
                      </p>
                    )}

                    <p className="mirror-privacy">
                      The mirror runs on this device alone. Nothing is recorded, saved, or sent
                      anywhere — close the page and it is gone.
                    </p>
                  </div>
                )}

                <button
                  className="mirror-panel-toggle"
                  data-testid="mirror-controls-toggle"
                  aria-expanded={showControls}
                  aria-controls="mirror-effects-panel"
                  onClick={() => setShowControls((open) => !open)}
                >
                  <SparkleIcon size={18} />
                  Effects
                  <ChevronDownIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
