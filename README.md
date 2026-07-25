# Family Game Console

A small family-friendly game console that lives on GitHub Pages:

- **Yahtzee Logger** — a mobile-first score logger (roll real dice, tap to log). One self-contained HTML file, works fully offline.
- **Ship Battle** — a two-player, cross-device naval guessing game (a Battleship-style game; "Battleship" is a trademark of Hasbro and is not affiliated). Two iPads, one shared code, no server.
- **Chess** — full-rules, drag-and-drop chess for two players: pass-and-play on one device, or online over a shared code.

**Play it:** https://rio517.github.io/yahtzee-calculator/

It's free and open source — the whole thing lives in this repo.

---

## Screenshots

| The console | Place your fleet |
| --- | --- |
| ![Game console menu](docs/screenshots/menu.jpg) | ![Placing ships, dragging from the tray](docs/screenshots/placement.jpg) |

| Battle view | Share the game code |
| --- | --- |
| ![Radar and fleet boards mid-battle](docs/screenshots/battle-view.jpg) | ![Share modal with QR code](docs/screenshots/share-qr.jpg) |

| Chess | |
| --- | --- |
| ![Chess board mid-game with legal-move hints](docs/screenshots/chess-board.jpg) | Drag-and-drop chess — full rules, same device or online. |

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

This is covered end-to-end by a test that simulates a full two-peer game *including a mid-game outage* and asserts both peers converge on the same finished game (`src/game/session.test.ts`).

---

## Chess

A full-rules chess game with drag-and-drop (or tap-to-move), playable two ways:

- **Same device** — pass-and-play on one screen; the board tells you whose move it is.
- **Online** — two devices connected by a 4-character code, exactly like Ship Battle (host plays White, guest plays Black). Reconnects and resumes the same way.

Every real rule is enforced: legal move generation, castling, en passant, promotion (with a piece picker), check, checkmate, stalemate, plus the fifty-move and insufficient-material draws. Illegal moves simply don't happen — you can only drop a piece on a legal square, and you can never leave your own king in check.

The engine is a self-contained, pure module (`src/game/chess/`) with no UI or network dependencies, verified by **perft** node-count tests — the gold standard for a move generator (the opening tree matches 20 / 400 / 8902 at depths 1–3, and the "Kiwipete" position matches 48 / 2039). Online play reuses the same event-sourced-log design as Ship Battle: the shared truth is the list of played moves, each authored by the side to move, so two peers reconcile by **"the longer log wins."** The peer transport (`src/net/peer.ts`) is generic over the message type, so both games share one WebRTC layer.

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
index.html              Vite entry (React app: menu + Ship Battle + Chess)
public/calculator.html  the Yahtzee logger (standalone, vanilla)
public/icon.svg         app icon
src/
  game/                 pure domain logic (fully unit-tested)
    types.ts            core types
    constants.ts        fleet, skins, scoring
    board.ts            placement geometry
    engine.ts           event-sourced reductions (turn/winner/board views)
    protocol.ts         wire messages + log reconciliation
    chess/              full chess rules + session (rules, fen, protocol, session)
    *.test.ts           unit + integration tests
  net/peer.ts           generic PeerJS transport (connect, retry, reconnect)
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
