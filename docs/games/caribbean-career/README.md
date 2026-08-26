# Caribbean Career — design dossier

This folder is the durable source of truth for an original, single-player
Caribbean career game inspired by the clarity and variety of the 2004 PC game
*Sid Meier's Pirates!* It is not a remake specification. The project keeps the
appeal of choosing a destination, running a small fleet, trading, courting,
duelling, and fighting readable naval battles while using original writing,
visuals, balance, data, interface, and identity.

## Product thesis

**A readable pirate career in a living Caribbean.** The player should be able
to understand the immediate decision in seconds while the world quietly makes
that decision matter. The experience is colourful and adventurous without
treating the region, colonial violence, or enslaved people as scenery or
resources.

The audience is a family sharing an installable web arcade. The commercial
quality bar is a premium-feeling, reliable game that happens to be free and
offline-capable—not a browser novelty.

## Current decisions

- Single-player first; Caribbean setting, roughly 1655–1720.
- **Adventure** is the only campaign length currently offered. **Voyage** and
  **Legend** remain compatibility values for existing saves until their
  duration mechanics ship.
- Three historical chapters let ports, wars, and piracy change over time.
- The 2004 game's simplicity is the reference constraint. Player-facing
  gauges stay few: ship condition, crew and morale, provisions in **months
  remaining**, gold, wind, and destination.
- Fleet and ship management is intentionally richer than the rest of the UI.
- Naval battles are dedicated real-time Three.js scenes using authored GLB
  ships, deterministic horizontal simulation, and expressive 3D motion.
- Dancing, stealth, and tactical land battles are deferred. Port conquest
  remains, built from naval combat plus a decisive duel.
- Relationships are inclusive, compact stories rather than stat spreadsheets.
- No runtime asset downloads. Ships, textures, decoders, and data ship inside
  the offline PWA.

## Documents

| Document | Purpose |
| --- | --- |
| [2004-mechanics-research.md](./2004-mechanics-research.md) | What the 2004 PC game did, which lessons to preserve, and where this game diverges |
| [historical-framework.md](./historical-framework.md) | Historical chapters, factions, ships, trade, wind, and representation boundaries |
| [game-design.md](./game-design.md) | Complete approved experience and system specification |
| [poc-implementation-plan.md](./poc-implementation-plan.md) | Exact, testable plan for the first naval and model proof-of-concepts |
| [poc-review.md](./poc-review.md) | Evidence, measurements, self-review findings, and POC recommendation |
| [production-roadmap.md](./production-roadmap.md) | Extremely structured, phase-by-phase implementation plan based on measured POC results |
| [five-minute vertical-slice plan](../../superpowers/plans/2026-08-23-caribbean-five-minute-vertical-slice.md) | Execution-ready TDD plan for the first production loop and its stop/go gate |
| [naval-battle-playtest.md](./naval-battle-playtest.md) | Honest three-session and target-iPad evidence ledger with exact thresholds |
| [naval-battle-review.md](./naval-battle-review.md) | Current production naval milestone decision and implementation boundary |
| [bridgetown-visual-reference.md](./bridgetown-visual-reference.md) | Authoritative historical visual basis, limits, and representation gate for the painted harbour |
| [bridgetown-asset-report.json](./bridgetown-asset-report.json) | Reproducible ImageGen prompt history, production asset identity, crop contract, and review disposition |

## Production Bridgetown and strategic-sailing evidence

Run `npm run caribbean:port-check` to build the normal production app, serve it
on a loopback-only port, and drive the registry route at `/#/caribbean` in
Chromium. The schema-v3 gate uses the real browser Web Lock and `localStorage`.
It completes setup, trade, rumour acceptance, save recovery, quarantine,
republish, reload, and resume, then drives the saved Bridgetown -> sailing ->
encounter -> avoid/return -> sailing -> encounter -> naval battle -> result ->
safe-return loop through rendered public controls. The final tracked evidence
refresh uses `CARIBBEAN_PORT_CAPTURE_DIAGNOSTICS=1 npm run
caribbean:port-check` so the ignored inspection bundle pins both terminal runs
and the selected-run-A publication before cleanup.

The command runs twice from clean browser storage and requires byte-identical
schema-v3 metrics plus exactly 22 byte-identical screenshots. The schema-v3
record is the [`technical metrics`](../../screenshots/caribbean-port/metrics.json).
Its exact 23-screenshot membership begins with these original 14 files:

[`setup`](../../screenshots/caribbean-port/setup-desktop.png),
[`Bridgetown port`](../../screenshots/caribbean-port/port-desktop.png),
[`market`](../../screenshots/caribbean-port/market-desktop.png),
[`tavern`](../../screenshots/caribbean-port/tavern-desktop.png),
[`Captain's Log`](../../screenshots/caribbean-port/captains-log-desktop.png),
[`recovery decision`](../../screenshots/caribbean-port/recovery-desktop.png),
[`exact 960×600 playfield`](../../screenshots/caribbean-port/port-minimum-supported.png),
[`959×600 width notice`](../../screenshots/caribbean-port/minimum-screen-width.png),
[`960×599 height notice`](../../screenshots/caribbean-port/minimum-screen-height.png),
and [`1024×1366 portrait notice`](../../screenshots/caribbean-port/minimum-screen-large-portrait.png).

The original set also includes the same opening harbour at
[`1180×820`](../../screenshots/caribbean-port/port-tablet-landscape.png) and
[`1024×768`](../../screenshots/caribbean-port/port-compact-landscape.png), a
forced local-art failure with working port controls at
[`1440×900`](../../screenshots/caribbean-port/port-art-fallback.png), and the
shared-player profile editor at
[`1440×900`](../../screenshots/caribbean-port/player-profile-desktop.png).
The route seeds Mario / `he/him`, changes the shared pronouns during setup,
then verifies that a later profile edit does not rewrite the campaign snapshot;
new campaigns are Adventure-only while legacy saves remain loadable.

The other exact nine members are
[`sailing`](../../screenshots/caribbean-port/sailing-desktop.png),
[`Red Jackdaw contact`](../../screenshots/caribbean-port/encounter-desktop.png),
[`campaign battle`](../../screenshots/caribbean-port/campaign-battle-desktop.png),
[`campaign result`](../../screenshots/caribbean-port/campaign-result-desktop.png),
[`returned Captain's Log`](../../screenshots/caribbean-port/returned-log-desktop.png),
[`exact 960×600 sailing`](../../screenshots/caribbean-port/sailing-minimum-supported.png),
[`campaign battle HTML fallback`](../../screenshots/caribbean-port/campaign-battle-fallback.png),
[`sailing portrait notice`](../../screenshots/caribbean-port/sailing-large-portrait-notice.png),
and [`battle-resize portrait notice`](../../screenshots/caribbean-port/campaign-battle-resize-notice.png).

The sole byte-comparison exception is the real 1440×900 WebGL-composited
`campaign-result-desktop.png`. Both runs must still be valid, nonempty PNGs
with exact equal canonical semantic state and digest at tick 11,855, including
canvas/drawing-buffer/backend facts, terminal outcome and seed, final player
and opponent systems, and the closed framebuffer-sample record. Run A owns the
tracked screenshot and every selected publication artifact. Honest A/B result
pixels are observational even when a particular capture happens to produce
identical bytes; the evidence boundary remains **22 byte-compared + 1 terminal
observation**, never 23 byte-identical screenshots.

Sailing and encounter reload their exact persisted strategic phase. Reloading
a saved naval phase constructs a fresh transient session at tick zero from the
byte-identical saved battle input and discloses that the engagement restarts
from first contact. An unsupported resize disposes the controller/session;
restoring support automatically resumes the persisted naval route as another
fresh tick-zero session. No campaign write occurs while the battle ticks.

Avoid, withdrawal, and every validated terminal outcome spend the guaranteed
return day and provision before returning to Bridgetown. The tactical outcome
remains in `world.lastVoyage`, while the pre-battle flagship stays unchanged
and ready: persistent damage, repair, capture, and prize-fleet systems remain
explicitly deferred. Victory alone completes the Red Jackdaw lead and target.

The painted-harbour evidence adds normal and forced image-error captures at
[`1440×900`](../../screenshots/caribbean-port/port-art-desktop.png),
[`1180×820`](../../screenshots/caribbean-port/port-art-wide.png),
[`1024×768`](../../screenshots/caribbean-port/port-art-tablet.png), and
[`960×600`](../../screenshots/caribbean-port/port-art-minimum.png), with the
corresponding `-fallback` files in the same folder. The browser gate calculates
the exact `object-fit: cover` transform, requires at least 70% of the reported
ship/town subject ROI to remain visible, checks opaque text backplates at WCAG
4.5:1 or better, enumerates control clipping and overlap, verifies the emitted
WebP MIME type, and confirms the hashed asset is in the production PWA
precache. Its isolated failure run aborts only that emitted WebP while every
other page, console, or request failure remains fatal.

Normal production intentionally emits and precaches the lazy campaign naval
JS/CSS and local sloop GLB. Setup, port, sailing, and avoid do not request those
assets; pursuit requests only the local production assets. Normal output ships
no `CaribbeanLab`, debug bridge/global, preview HTML, harness config, or
harness-only failure marker.

This is repeatable desktop-browser engineering evidence, not a claim of human
comprehension or physical-device approval. A real target iPad, Safari/touch,
offline installation, thermal/sustained-performance behavior, and first-time-
player observation remain unobserved.

## Production naval evidence

The naval command is deliberately mode-explicit:

- `npm run caribbean:naval-check -- --semantic-probe` runs the real harness in
  a unique temporary directory and is non-writing;
- `npm run caribbean:naval-check -- --capture` is the sole tracked evidence
  writer and requires a clean source HEAD; and
- `npm run caribbean:naval-check -- --verify` regenerates fresh temporary
  observations after the evidence commit, checks their allowed ranges, and
  verifies the exact tracked stable manifest/source provenance without
  requiring live FPS, duration, resource samples, or PNG pixels to repeat.

The capture build serves the harness-only production entry on an OS-assigned
local port, drives the Battle Lab in Chromium, and writes only genuinely
changed evidence bytes. The current evidence set includes the
[`technical metrics`](../../screenshots/caribbean-naval/metrics.json),
[`tablet decision`](../../screenshots/caribbean-naval/decision-tablet.png),
[`tablet briefing`](../../screenshots/caribbean-naval/briefing-tablet.png),
[`tablet battle`](../../screenshots/caribbean-naval/battle-tablet-landscape.png),
[`desktop battle`](../../screenshots/caribbean-naval/battle-desktop.png),
[`1024×768 battle`](../../screenshots/caribbean-naval/battle-minimum-supported.png),
[`960×600 boundary battle`](../../screenshots/caribbean-naval/battle-boundary-supported.png),
[`phone portrait notice`](../../screenshots/caribbean-naval/minimum-screen-phone-portrait.png),
[`phone landscape notice`](../../screenshots/caribbean-naval/minimum-screen-phone-landscape.png),
[`boarding-ready result`](../../screenshots/caribbean-naval/boarding-ready-result.png),
[`supported-screen HTML fallback`](../../screenshots/caribbean-naval/fallback-tablet-landscape.png),
and [`physical broadside evidence`](../../screenshots/caribbean-naval/broadside-handedness.png).

The engineering gate currently passes, but the milestone remains
`revise-battle`: human comprehension/rematch sessions and target-iPad Safari,
touch, offline, thermal, and sustained-performance observations are incomplete.
That boundary permits continued port/career work only on the isolated branch;
it is not a production-ready or merge claim.

## Decision rule

When a proposed feature conflicts with the dossier, use this order:

1. Protect the clear minute-to-minute loop.
2. Preserve meaningful ship choice and battle feel.
3. Preserve respectful historical framing.
4. Prefer depth that lives underneath a simple interface.
5. Defer a layer until play proves it is needed.

## Research notation

- **Documented** means supported by the official manual or a primary source.
- **Observed** means recorded by contemporary reviews, design interviews, or
  a detailed player-authored mechanics guide and should be validated against a
  running copy before copying exact timing or numbers.
- **Design inference** means our conclusion, not a claim about the original.
