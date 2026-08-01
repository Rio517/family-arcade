# 8. An app-level "party" layer for connection, identity, and video

Status: Accepted

## Context

ADRs 0003 and 0007 gave each game its own peer-to-peer link for game data and,
optionally, an in-game voice/video call. But the family plays several games in a
sitting: two friends would connect in Ship Battle, then want to switch to Chess —
and have to re-enter a code and restart the call every time. They also asked to
stay on a video call *while playing different games independently*, which a
per-game, per-screen call can't do because navigating away unmounts it.

The connection, the two players' names, and the call all need to outlive any
single game screen.

## Decision

Introduce a **party**: a single connection + identity + optional call that lives
**above the router**, so navigating Home → a game → a different game never tears
it down.

- `PartyProvider` (`src/shared/party/PartyContext.tsx`) is mounted in `main.tsx`
  outside `<Routes>`. It owns:
  - a persistent presence `GameConnection` (prefix `party-v1-`) that only
    exchanges names (a `hello` message) — **game rules still travel on each
    game's own link**, unchanged;
  - one opt-in `MediaLink` (prefix `party-call-v1-`), off by default (ADR 0007's
    voice-first, camera-opt-in model);
  - identity, shared with the device profile (`useProfile`).
- `PartyBar` (a bottom-center pill) and `FloatingVideo` (a draggable picture-in-
  picture) are also mounted above the router, so the call UI is always present
  while a call is on, across any screen.
- Because a party is not a game, it stays deliberately **thin**: presence + names
  + media only. It never replays or rewrites game history, so it does not touch
  the event-sourced "longer log wins" model (ADR 0003).

## Consequences

- Two players connect once and keep their names, connection, and call across
  games — the thing the family actually asked for.
- Identity must be a single source of truth: `useProfile` now reads a shared
  module store (`profileStore.ts`, via `useSyncExternalStore`) so a name changed
  in the party bar is seen live by the menu and the game on screen, instead of
  each `useProfile()` holding a private copy that drifts.
- The party's presence link and each game's data link are **separate**
  connections on separate broker prefixes. Handing a code off from the party to a
  game (auto-join) is future work, not part of this layer.
- Same broker + STUN reliance and NAT caveat as ADRs 0003/0007; nothing new is
  hosted.
