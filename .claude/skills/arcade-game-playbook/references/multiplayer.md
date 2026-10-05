# Multiplayer: play together on several devices

From Gulp's play-together work (`docs/plans/2026-10-02-gulp-play-together.md`).
The racer (`src/games/racer/net/`) is the two-device precedent.

## Shape

- **Host authoritative, guests mirror.** One device runs the real world.
  Each guest builds the same city from the seed, steers its own hole
  locally (the same `move()` the rules use), reports it 20 times a second,
  and applies the host's ticks and events to a mirror. The view is
  unchanged: it is handed the same events either way.
- **Lockstep was measured and rejected.** The same seed stepped at 60 Hz and
  120 Hz ended 351 units apart. One rng drives everything, and `Math.exp`,
  `pow`, `hypot` and `atan2` can differ between JavaScriptCore and V8.
- **A star, not a mesh:** each guest links only to the host
  (`src/shared/net/host.ts`, up to 3 guests).

## The wire

- Messages: `hello`, `lobby`, `pick`, `start` (seed, options, wonders,
  seats), `ready`, `pos` (20 Hz), `tick` (20 Hz: holes, power-ups, attacks,
  events since the last tick, a checksum once a second), `snapshot` (on
  reopen, rejoin or a checksum mismatch), `over`, `again`.
- Numbers travel as whole numbers: positions in hundredths, timers in tenths.
  BinaryPack packs a fraction as a 9-byte double.
- **One validation choke point** (`isGulpMsg`, tuples checked by arity and
  type, at most 12 holes and 2,000 events a tick). The host clamps a guest's
  move to its top speed and ignores any claim about the world from a guest.
- Measured traffic: about 5 to 8 KB a second per guest. Bursts matter, not
  bandwidth: a giant swallowing a block is about 400 events in one tick
  (about 3 KB), still under one 16 KB chunk.

## Drops, in the domain where they are tested

- A guest quiet for 3 s: its hole waits, faint and safe, with its name tag;
  other screens say "Waiting for <name>…". After 20 s (`AWAY_WAIT`) a computer
  brain plays it and hands it back when the guest reports again
  (`domain/holes.ts`, `world.ts` `dropOut` / `comeBack`,
  `domain/together.test.ts`).
- The host quiet: guests hold still and say "Waiting for <name>…". After 60 s
  their round ends early, and the results say the host's game stopped.
- A screen wake lock runs during a shared round (`src/shared/ui/useWakeLock.ts`).

## Tests that proved it

- **Replay equivalence:** encode every tick of a seeded three-minute round
  with a level-20 giant, decode it into a mirror, and at every tick the
  mirror's standing things, holes, people, power-ups and attacks match the
  host's. Then drop a range of ticks, apply a snapshot, and they match again.
- **Real PeerJS in real browsers:** scripts named `together-e2e.mjs` (two
  windows), `together-four.mjs` (four) and `together-drop.mjs` (a guest
  closes mid-round) drove the real thing. They ran against the dev server on
  `http://127.0.0.1:5178/#/gulp` (`URL=` to change it); `ENGINE=webkit`
  selects Safari's engine. Four windows need GPU flags
  (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`); with software
  GL, clicks time out. The dev server exposes `window.__gulp` (the world, or
  the guest's mirror). Check `scripts/` for what has landed on main; if
  they are missing, rewrite them from this description and commit them.
- **Link once (a proposed ADR, not yet in `docs/decisions/`):** devices link once with letters and
  are remembered until unlinked or 90 days unseen; the hub (the device that
  made the letters) holds up to 4 on at once and remembers 8; an invited
  device gets a full-screen invitation anywhere in the arcade.

## Product lessons

- Joining must be one easy path in a child's words. "Open lobby" and "join
  with a code" confused the family: "they stop and wonder". This led to PLAY
  and PLAY WITH FRIENDS, one question per screen, and the full-screen player
  select. A device already linked in the arcade's party joins without letters.
- The party connects two devices (ADR 0008). Three or four in the party need
  a new ADR before building.
- Every child's hole wears its name; results are one shared card, and each
  device records only its own child's ticket.
