# 13. The arcade runs its own connection service in the EU

Status: Accepted

## Context

Two devices that play together need help to find each other before they can
talk directly (ADR 0003). That help has two parts: a broker that passes the
first hello (the WebRTC offer, answer and address candidates) between them,
and a STUN server that tells each device the address the internet sees for
it. The arcade used PeerJS's free cloud broker and Google's and Twilio's
public STUN servers for both.

Those are third parties outside the EU, with their own logging and their own
uptime. The arcade promises families no tracking, and its privacy page has to
say exactly who sees what. It already runs on its own server in Germany
(familyarcade.eu, a Hetzner VM).

## Decision

**The arcade runs its own connection service on its server in Germany, and
clients use nothing else.**

- **Broker:** the official PeerJS server (`peerjs/peerjs-server`, version
  pinned) at `https://familyarcade.eu/connect/`, behind the same Caddy that
  serves the arcade. The WebSocket is `/connect/peerjs`. Discovery is off, so
  nobody can list who is connected. CORS answers any origin, because games
  built from the starter template run on `*.github.io` and localhost.
- **STUN:** coturn in STUN-only mode at `stun:familyarcade.eu:3478` (UDP and
  TCP). No TURN: it relays nothing and needs no credentials.
- **No logs.** Neither container keeps a log (Docker's `none` log driver;
  coturn's own log goes nowhere), and the `/connect/` route has no access log,
  like the rest of familyarcade.eu.
- **One constant per codebase.** `CONNECTION_SERVICE` in
  `src/shared/net/peer.ts` holds the broker and STUN settings; `GameConnection`,
  `GameHost` and `MediaLink` all pass it to `new Peer`. The starter template
  has the same constant in `src/arcade/peer.ts`.

How the server side runs (stacks, firewall, checks) is in the hetzner-ops
README, under "The arcade's connection service".

## Consequences

- Devices find each other through the Family Arcade's own connection service
  on our server in Germany. It passes only the first hello between devices and
  keeps no log. Then game data goes directly between the devices, as before.
- The arcade now depends on its own server for pairing. If the VM is down,
  devices cannot start a game together, and a dropped broker link shows as a
  reconnect, as a cloud-broker hiccup did before. Uptime is ours to watch.
- Anyone can use the broker, as with PeerJS's cloud. Ids stay guessable, so
  the transports still refuse strangers who learn a code (ADR 0003, 0008).
- Still no TURN relay: devices behind strict NATs that STUN cannot get
  through still fail to connect, as before. A relay would carry game data
  through the server and is a separate decision.
- A PeerJS client upgrade has to stay compatible with the pinned server
  version; bump them together.
