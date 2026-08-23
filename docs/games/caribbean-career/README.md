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
