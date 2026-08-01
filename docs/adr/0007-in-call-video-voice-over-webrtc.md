# 7. In-game video + voice over the existing WebRTC link

Status: Accepted

## Context

Two-player games already connect the devices directly over WebRTC (ADR 0003).
The family wants to see and hear each other while playing — a little FaceTime
window alongside the game — and we want to keep the "no server we run" promise.
The players are children, so privacy defaults matter.

See `docs/planning/video-voice-streaming.md` for the fuller exploration.

## Decision

Add peer-to-peer **voice, with opt-in video**, riding the same WebRTC transport
the game data uses. WebRTC carries media natively; PeerJS exposes it as a media
call (`peer.call` / `call.answer`). Concretely:

- A shared `src/shared/net/media.ts` (`MediaLink`) manages `getUserMedia`, the
  PeerJS media call, mute, and camera on/off. It pairs with the **same game
  code** as the data link (its own broker peer id, a media-specific prefix), so
  it needs no changes to `peer.ts` and no server beyond the public broker + STUN
  already in use.
- **Voice is the default; the camera is strictly opt-in** (off until the player
  taps it, so the camera permission is only requested when they ask for it).
  Mic mute is a track toggle; turning the camera on/off re-establishes the call
  with/without a video track (PeerJS media calls don't renegotiate tracks in
  place).
- **Ship Battle is the first game** to get it (the calmest screen). Rainbow Racer
  and online Chess can follow. Rainbow Racer, being a 3D game, may stay
  voice-only to spare battery.
- Nothing is recorded or stored — it's ephemeral peer-to-peer. A clear "camera
  on" indicator and one-tap off are required. If permission is denied or the
  link can't form, the game plays on with no call.

## Consequences

- No media server or relay we host; media reuses the free broker + public STUN.
- **Same NAT caveat as ADR 0003:** strict networks may fail to connect media
  without a paid TURN relay (out of scope). Works on the same home wifi.
- Live camera during a 3D game is heavy (battery/bandwidth) — hence voice-first
  and the per-game choice about whether to offer video.
- Media negotiation lives in `shared/net`, decoupled from `GameConnection`, so a
  game opts in by mounting the call UI with its game code.
