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
- A campaign-length choice at the start: **Adventure** (30–60 minutes),
  **Voyage** (2–3 hours), or **Legend** (8–12 hours). This changes pacing and
  content density, not the rules.
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

## Production Bridgetown evidence

Run `npm run caribbean:port-check` to build the normal production app, serve it
on a loopback-only port, and drive the registry route at `/#/caribbean` in
Chromium. The gate uses the real browser Web Lock and `localStorage`, completes
setup, trade, rumour acceptance, save recovery, quarantine, republish, reload,
and resume, and rejects preview/naval resources in the normal bundle. It runs
the journey twice from clean storage and updates evidence only after the
metrics and reduced-motion screenshots match byte-for-byte.

The current set includes the
[`technical metrics`](../../screenshots/caribbean-port/metrics.json),
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

This is repeatable desktop-browser engineering evidence, not a claim of human
comprehension or physical-device approval. A real target iPad, Safari/touch,
offline installation, and first-time-player observation remain unobserved.

## Production naval evidence

Run `npm run caribbean:naval-check` to build the harness-only production entry,
serve `dist` on an OS-assigned local port, drive the Battle Lab in Chromium,
and write changed evidence bytes only. The current evidence set includes the
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
