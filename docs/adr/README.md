# Architecture Decision Records

Short notes capturing the *significant* choices behind the Family Arcade and
*why* we made them, so a future session (human or AI) doesn't have to re-derive
them. Format is lightweight [ADR](https://adr.github.io/): Status, Context,
Decision, Consequences.

These are backfilled from the invariants the codebase already lives by (see
`CLAUDE.md`) plus new decisions as we make them.

| #    | Decision | Status |
|------|----------|--------|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](./0002-games-are-modules-with-one-registry.md) | Games are self-contained modules behind one registry | Accepted |
| [0003](./0003-serverless-peer-to-peer-multiplayer.md) | Serverless peer-to-peer multiplayer (WebRTC/PeerJS) | Accepted |
| [0004](./0004-offline-first-pwa.md) | Offline-first PWA, no runtime downloads | Accepted |
| [0005](./0005-deterministic-seeded-randomness.md) | Deterministic, seeded randomness | Accepted |
| [0006](./0006-procedural-3d-with-lazy-three.md) | Procedural 3D with lazily-loaded three.js | Accepted |
| [0007](./0007-in-call-video-voice-over-webrtc.md) | In-game video + voice over the existing WebRTC link | Accepted |
