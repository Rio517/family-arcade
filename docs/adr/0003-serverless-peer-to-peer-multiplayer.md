# 3. Serverless peer-to-peer multiplayer (WebRTC/PeerJS)

Status: Accepted

## Context

This is a hobby project deployed as a static site on GitHub Pages. We want
online play between two devices without running (or paying for) a backend, and
without collecting anyone's data.

## Decision

Connect the two devices **directly** with WebRTC, wrapped by PeerJS, in
`src/shared/net/peer.ts` (`GameConnection`). Two devices pair with a short shared
**game code**: the host registers a broker peer id derived from the code, the
guest dials it. We rely only on free public infrastructure:

- **Signaling** via PeerJS's public broker (handshake only).
- **STUN** via public Google/Twilio servers for NAT traversal.

Data channels are opened `reliable: true` (ordered). Turn-based games are
**event-sourced**: state is derived by replaying an ordered log, and peers
reconcile with "longer log wins", so a dropped/reopened channel just re-runs a
sync. Consequences of that model are honored elsewhere: undo/rewind and custom
start positions are **local-only**, and no online feature rewrites history.

## Consequences

- No server to run, pay for, secure, or store data on. Media can ride the same
  transport later (see ADR 0007).
- **Caveat:** strict/symmetric NATs that STUN can't traverse need a **TURN**
  relay, which is a paid server — out of scope. Two devices on the same home
  wifi (the common case) connect fine. The public broker can hiccup; the game
  layer treats that as a reconnect.
- Inbound wire data is validated at a single choke point (`isMessage`) per game.
