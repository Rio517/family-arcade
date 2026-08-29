# 10. Camera effects with bundled MediaPipe tracking

Status: Accepted

## Context

The family wants Snapchat-style effects on the party-mode video call: a 3D
dragon head that sits over a player's head and breathes fire when they open
their mouth, and hand-gesture effects (flash a peace sign, something magical
happens). They also want a **solo mode** — point the camera at yourself and
play with the effects without needing a call — and effects that work when
**two people share one camera** (two kids, two dragon heads).

The hard part is face/hand tracking in the browser. Constraints from earlier
ADRs: offline-first PWA with no runtime third-party fetches (ADR 0004), 3D is
procedural three.js loaded lazily (ADR 0006), randomness is seeded (ADR 0005),
and the call itself is a fragile PeerJS media link that re-forms whenever the
camera toggles (ADR 0007).

## Decision

**Track with Google's MediaPipe Tasks (`@mediapipe/tasks-vision`, Apache-2.0),
fully self-hosted.** Two task models run client-side on live video:

- **Face Landmarker** (up to 2 faces): per-face landmarks, a head-pose
  transform, and 52 expression blendshapes — `jawOpen` is the fire-breath
  trigger. Multiple faces in one frame each get their own effect.
- **Gesture Recognizer** (up to 2 hands): built-in gesture classes; `Victory`
  (the peace sign) triggers the first hand effect.

**Everything is bundled, nothing fetched at runtime.** The `.task` model files
(3.8 MB face, 8.4 MB gestures) live in `src/shared/effects/assets/` exactly
like the ship `.glb` meshes, and the WASM runtime comes from the npm package
via `?url` imports. We ship **only the SIMD WASM build** (~11 MB) — every
browser the family uses has had WASM SIMD since ~2021 — and show a friendly
"effects can't run here" state on anything older, rather than doubling the
payload with the no-SIMD fallback. All of it is lazy-loaded: players who never
open an effect never download a byte of it, same as the three.js chunk.

**Effects are drawn on top of the video, never burned into the stream.** A
transparent three.js canvas overlays each `<video>` element and renders
procedural geometry (ADR 0006: lathe/cones/canvas textures, no fetched
models) anchored to the tracked face/hand. In a call, each device runs the
tracker on whatever video it is *displaying* — its own preview and the remote
stream alike — and the chosen effect travels as a tiny message on the
existing party data channel. The transmitted media stays untouched, which:

- avoids a canvas re-encode (battery, latency, resolution loss),
- avoids touching `MediaLink`'s call re-forming behaviour entirely, and
- keeps working when only one side supports effects (the other side simply
  sees plain video).

**Solo mode is a real game module: "Magic Mirror"** (`src/games/mirror/`), a
registry entry like any other game. The camera is strictly opt-in (nothing is
recorded, nothing leaves the device — the stream goes from `getUserMedia`
straight to a local `<video>`), and the page hosts the effect picker. The
tracking engine and effect scenes live in `src/shared/effects/` so the party
call overlay (a follow-up) reuses them without shared→game imports.

## Consequences

- **~23 MB of new lazy assets** (WASM + two models) join the service-worker
  precache so effects work offline after install. That is the real cost of
  this feature; it is paid once per install, not per session, and only the
  SIMD variant keeps it from being ~35 MB.
- Tracking quality is MediaPipe's, not ours: glasses, low light, and extreme
  head angles degrade gracefully (the effect hides when its face is lost).
- Effects follow the house rules: seeded-LCG particles, fire becomes a static
  glow under `prefers-reduced-motion`, and jsdom tests assert the no-WebGL
  fallback while pure conversion/trigger logic is unit-tested directly.
- The overlay-not-burn-in choice means screenshots and screen recordings of
  the *other* device's raw stream show no effect — acceptable for a family
  toy, and reversible later by compositing locally if anyone ever wants to
  record.
- Two model inferences per displayed video is real CPU/GPU work. The tracker
  throttles (gestures run at a lower cadence than faces) and pauses when the
  tab is hidden; battery on older iPads is the thing to watch in practice.
