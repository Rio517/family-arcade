/**
 * Magic Mirror — the solo home of the camera effects (ADR 0010). Open the
 * mirror, see yourself, toggle effects on and off. Everything runs on this
 * device: the camera stream goes straight into a local <video> and is never
 * recorded, stored, or sent anywhere.
 */
import '../styles/mirror.css';
import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { EffectsOverlay } from '@shared/effects/EffectsOverlay';
import { EFFECTS, type EffectId } from '@shared/effects/effects';
import { CameraIcon, CloseIcon, WarningIcon } from '@shared/ui/icons';

type Phase = 'intro' | 'starting' | 'live' | 'denied';

export function MirrorPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [selected, setSelected] = useState<EffectId[]>(['dragon']);
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

  const openMirror = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPhase('denied');
      return;
    }
    setPhase('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setPhase('live');
    } catch {
      setPhase('denied');
    }
  };

  const closeMirror = () => {
    stopCamera();
    setVideoEl(null);
    setAspect(null);
    setPhase('intro');
  };

  // Leaving the page must release the camera light immediately.
  useEffect(() => stopCamera, []);

  useEffect(() => {
    if (videoEl && streamRef.current) videoEl.srcObject = streamRef.current;
  }, [videoEl]);

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

  return (
    <div className={live ? 'app mirror is-live' : 'app mirror'}>
      <header className="mirror-head">
        <h1>Magic Mirror</h1>
        {live ? (
          <button className="back-link mirror-close" data-testid="mirror-close" onClick={closeMirror}>
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
          <p className="mirror-lede">
            Look into the mirror and become a <strong>fire-breathing dragon</strong> — open your
            mouth wide! Flash a <strong>peace sign</strong> for rainbow stars. Two of you fit in
            the mirror at once.
          </p>
          {phase === 'denied' ? (
            <p className="mirror-error" data-testid="mirror-error">
              <WarningIcon size={18} /> The mirror needs the camera to work. Check the camera
              permission for this site, then try again.
            </p>
          ) : (
            <p className="subtle">
              The camera stays on this device — nothing is recorded or sent anywhere.
            </p>
          )}
          <button
            className="btn mirror-open"
            data-testid="mirror-start"
            onClick={openMirror}
            disabled={phase === 'starting'}
          >
            <CameraIcon size={20} />
            {phase === 'starting' ? 'Opening…' : phase === 'denied' ? 'Try again' : 'Open the mirror'}
          </button>
        </section>
      )}

      {live && (
        <section className="mirror-live">
          {/* Whatever space the header and the controls leave: the glass is cut
              to fit inside it, so a short landscape window never scrolls. */}
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
            </div>
          </div>
          <div className="mirror-controls">
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
          </div>
          <p className="subtle mirror-hints">
            {EFFECTS.filter((e) => selected.includes(e.id))
              .map((e) => e.hint)
              .join(' ') || 'Pick an effect to start the magic.'}
          </p>
          {selected.length > 0 && (
            <p className="mirror-beta-note" data-testid="mirror-beta-note">
              These effects are brand new and still in testing — they might wobble a bit while we
              tune them!
            </p>
          )}
        </section>
      )}
    </div>
  );
}
