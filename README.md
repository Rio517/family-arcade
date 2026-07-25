# Family Game Console

A small family-friendly game console that lives on GitHub Pages:

- **🎲 Yahtzee Logger** — a mobile-first score logger (roll real dice, tap to log). One self-contained HTML file, works fully offline.
- **🚀 Ship Battle** — a two-player, cross-device naval guessing game (a Battleship-style game; "Battleship" is a trademark of Hasbro and is not affiliated). Two iPads, one shared code, no server.

**Play it:** https://rio517.github.io/yahtzee-calculator/

---

## Ship Battle

Two people on two different devices play a turn-based naval guessing game connected only by a short game code.

- **Peer-to-peer** over WebRTC (via [PeerJS](https://peerjs.com/)). One player taps **Create a game** and gets a 4-character code (and a shareable invite link); the other taps **Join** and types it in. Game data then flows device-to-device.
- **Pick your fleet** — choose a cosmetic skin (free ones plus premium skins unlocked with points).
- **Place your ships** on your own board (tap-to-place, rotate, or auto-place).
- **Two battle boards** — a **Radar** view (your shots on the enemy) and a **Fleet** view (your ships + incoming fire), side-by-side on a tablet or tabbed on a phone, with a live battle log.
- **Points & history** — win to earn points (bonus for a decisive victory), spend them on cooler fleets. Records and unlocks persist in `localStorage`.
- **Resume anywhere** — the whole game is an event-sourced log persisted on each device. Step away, lose signal, or refresh, and reconnecting with the same code replays the history and picks up exactly where you left off.
- **Installable PWA** — add it to the iPad home screen; the app shell is cached so it opens instantly even on a flaky connection.

### How resume / reconnect works

The shared truth is an **append-only log of settled shots**. Everything the UI shows — whose turn it is, which cells are hit, who won — is a pure function of that log (plus your own private ship placement). A settled shot is authored only by the *defender* (the one who can resolve it against their own board), and turns strictly alternate, so exactly one device writes each log entry. That single-writer property means two reconnecting peers reconcile trivially: **the longer log wins**, with no merge conflicts. A dropped message or a mid-game disconnect self-heals on the next sync.

This is covered end-to-end by a test that simulates a full two-peer game *including a mid-game outage* and asserts both peers converge on the same finished game (`src/game/integration.test.ts`).

---

## Development

Requires Node 20+.

```bash
npm install
npm run dev        # local dev server
npm test           # run the test suite (Vitest)
npm run typecheck  # strict TypeScript, no emit
npm run build      # production build → dist/
npm run preview    # serve the production build locally
```

### Project layout

```
index.html              Vite entry (React app: menu + Ship Battle)
public/calculator.html  the Yahtzee logger (standalone, vanilla)
public/icon.svg         app icon
src/
  game/                 pure domain logic (fully unit-tested)
    types.ts            core types
    constants.ts        fleet, skins, scoring
    board.ts            placement geometry
    engine.ts           event-sourced reductions (turn/winner/board views)
    protocol.ts         wire messages + log reconciliation
    *.test.ts           unit + integration tests
  net/peer.ts           PeerJS transport (connect, retry, reconnect)
  state/                profile (points/unlocks) + the useBattleship hook
  storage/              localStorage persistence (profile + resumable games)
  components/           React UI (Menu, Lobby, FleetSelect, Placement, Battle, …)
  styles/global.css     hand-rolled CSS design system
```

The design principle: **all game rules live in pure, tested modules**; React and the network layer are thin wiring around them.

---

## Deploy

Deployment is automated by GitHub Actions (`.github/workflows/deploy.yml`): every push to `main` builds the app, runs the tests, and publishes `dist/` to GitHub Pages.

**One-time setup:** in the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

The Yahtzee logger remains a single vanilla HTML file — served as `calculator.html`, no build required.
