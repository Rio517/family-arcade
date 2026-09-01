# Planning: video + voice between players (no server of our own)

Status: **draft / thinking out loud.** Nothing here is built yet — this is a place to
decide what we want before writing code.

## The idea

While two people play a 2-player game (Ship Battle, online Chess, Rainbow Racer),
let them **see and/or hear each other** — like a little FaceTime window riding along
with the game — **without us running a server**.

## Why this is realistic

The 2-player games already connect the two devices **directly to each other** with
WebRTC (via PeerJS), in `src/shared/net/peer.ts`. That same technology carries
**audio and video**, not just game data. PeerJS exposes it as a *media call*
(`peer.call(id, stream)` / `peer.on('call', …)`) that runs over the same peer link
we already use.

So the plan is basically: ask the browser for the camera/mic (`getUserMedia`), hand
that stream to the peer, and show/play what comes back. No media server, nothing we
host.

## What "no server" honestly means

We don't run a **game server** or a **media relay**. But WebRTC still needs two small,
free, public helpers — and we already rely on both today for the game data:

1. **Signaling** — the initial "here's how to reach me" handshake. Today this is
   PeerJS's free public broker. Same broker the data channel already uses.
2. **STUN** — helps each device learn its public address so they can find each other
   through home routers. We already point at Google/Twilio public STUN servers.

**The one honest caveat:** some strict networks (certain corporate/guest wifi, some
carrier-grade NAT) block direct connections, and the only fix is **TURN** — a relay
server that forwards the media. Reliable TURN costs money/hosting, i.e. a *server*.
For the common case here — **two devices on the same home wifi** — TURN is usually not
needed. We should just be clear that "strict networks may not connect," the same
limitation the game data already has.

## Flavors we could build

- **A — Voice only.** Just the mic, plus a "🔊 talking" indicator. Lightest on
  battery/bandwidth, fewest privacy worries, works even on a weak link. Great for
  banter during a race or a battle.
- **B — Voice + tiny video ("face bubble").** A small circular webcam of the other
  player in a corner, plus voice. Feels like a video call while you play. Heavier;
  needs camera permission.
- **C — Toggleable.** Start on voice; buttons to turn *your* camera on/off and to
  mute/unmute. Most flexible.

**Leaning toward:** build the plumbing once, ship **voice-first with an optional video
toggle** (C, defaulting to voice). Kid-friendly and light, with room to grow.

## Where it would live in the code

- A new shared module, e.g. `src/shared/net/media.ts`, that:
  - wraps the PeerJS **media call** (call / answer) on the *same* peer as the data link,
  - manages `getUserMedia`, adding/removing tracks, mute + camera toggles,
  - hands back the remote `MediaStream` and a simple status.
- A small shared UI piece — a "call strip" / face-bubble with mute + camera buttons,
  a `<video>`/`<audio>` element, and connection state.
- Wire it into the games that already have a peer connection (Ship Battle and Rainbow
  Racer). Because they already exchange a code + peer id, the media call reuses that.

## Tricky bits & things to decide (kids especially)

1. **Permissions.** Browsers require a tap + explicit camera/mic permission. Needs a
   friendly prompt ("Let your friend hear you? 🎤") and must degrade gracefully if
   denied — the game keeps working, just no call.
2. **Privacy & safety.** It's children on camera. Decisions to make:
   - Voice-only by default, camera strictly opt-in?
   - It's peer-to-peer and ephemeral — nothing is recorded or stored (true by default
     with WebRTC). Worth stating plainly in the UI.
   - A clear "camera is on" indicator and a one-tap off switch.
3. **Autoplay rules.** Browsers block sound until a user gesture; the existing
   "Create / Join / Start" tap covers that.
4. **iOS Safari quirks.** `getUserMedia` needs HTTPS (we have it) and a gesture; only
   one camera at a time; PWA vs Safari behave a little differently. Deserves a real
   device test pass.
5. **Battery / heat / bandwidth.** Live video on a phone *while also* running the 3D
   racer is heavy. Voice-only is much lighter. Maybe: allow video in Ship Battle /
   Chess (calm), keep Rainbow Racer voice-only.
6. **Broker reliability.** The free PeerJS broker occasionally hiccups (we've seen
   "Reconnecting…"). Fine for family use. If it ever gets annoying, self-hosting a tiny
   broker is possible — but that's a *server*, so out of scope for this "no server" goal.
7. **Layout.** Where do faces go without covering the board/arena? Probably a small,
   draggable corner bubble.

## A possible order of work

- **Phase 0 (this doc).** Decide: voice-only vs voice+video, which game first, camera
  default, and that we're OK relying on the free broker + public STUN.
- **Phase 1.** `media.ts` + a **mute-only voice** call in Ship Battle (the simplest
  screen). Prove the plumbing end to end.
- **Phase 2.** Add the face-bubble **video toggle**; bring it to Rainbow Racer (voice
  default there).
- **Phase 3.** Polish: friendly permission prompts, on-air indicators, reconnection,
  an iOS device pass, and remembering mic/camera preferences.

## Open questions for us

- Voice-only to start, or voice **and** optional video?
- Which game first — **Ship Battle** (simplest to add to) or **Rainbow Racer** (most
  fun to talk over)?
- Camera default **off / opt-in**, given it's kids?
- Comfortable relying on the **free PeerJS broker + public STUN** (works great on the
  same home wifi; may fail on strict networks, where the only fix would be a paid TURN
  relay)?
