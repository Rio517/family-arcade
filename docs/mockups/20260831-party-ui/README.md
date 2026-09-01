# Party & player UX (2026-08-31)

**Product direction:** the visual design is fine; the UX needs work. Ten
proposals. Six shipped in
[#145](https://github.com/Rio517/family-arcade/pull/145); four are open.

This folder has no HTML page because the review frames were the production
components themselves. *How to review the rest* explains how to set that up
again for the four open proposals.

## The ten proposals

| # | Proposal | State |
|---|----------|-------|
| 1 | Ticket tap means **Play**; `Details` is a separate 44px control | **open** — the play-vs-preview ambiguity |
| 2 | Every identity door says **Switch player** and opens the same picker; no "Playing as" label | shipped |
| 3 | The control says **Play together**; the panel says **Play Online** and offers **Start Pairing** or **Enter Code** | shipped |
| 4 | The pill expands into a complete invitation | **open** |
| 5 | Lobby modes read **Play here** / **Play Online** / **Free Board** | **open** |
| 6 | Waiting and recovery keep the code visible and always offer a way out | shipped |
| 7 | An unboxed **Continue Chess ›** row before the catalogue | shipped |
| 8 | Rich ticket posters survive above the floating control | shipped (scroll-into-view + bottom reserve) |
| 9 | The floating video gains **Full screen** and a larger self-preview; effect chips stay full-screen-only | **open** |
| 10 | The Magic Mirror moves out of the catalogue into the global controls | shipped as a second door |

On 10: the Magic Mirror should be reachable from more than one place, so it
gained a door in the global controls and kept its catalogue ticket.

Constraints that still apply: no new colour, font, server, account, or
discovery mechanism; reuse the existing ticket, picker, booth, party
pill/panel, effect chips and call surfaces; the only new layout rule is shared
bottom clearance on scrollable routes; under reduced motion the invitation
changes state instantly instead of expanding or pulsing; the global control
never auto-hides while scrolling.

## How to review the rest

Build the frames from the production components. Show Today beside Proposed,
with each proposed state being the same component behind an opt-in `proposed`
prop that defaults to off, so nothing ships while it is under review. Embed
the fixtures as `<iframe>`s at exactly 1180×820 and 430×932; a scaled div
reports the wrong media queries and safe areas.

Generated art is a poor fit here. It drifts from the product and moves the
review onto icons and geometry that were never in question.

Serve the harness over Tailscale HTTPS. Review happens on whatever device is
to hand, often remote, and the camera surfaces require a secure origin.

```sh
export PATH="$HOME/.local/share/mise/installs/node/20.20.2/bin:$PATH"   # Node 20
BUILD_HARNESS=1 npx vite build
nohup python3 -m http.server 4322 --bind 127.0.0.1 --directory dist \
  > /tmp/arcade-static.log 2>&1 & disown
tailscale serve --bg 4322     # https://marios-mac-mini.taila17368.ts.net/
```

Use a plain static server. `vite preview` returns 403 behind that proxy
because it rejects the unfamiliar Host header. Do not run the server as a
background tool task; it is killed at the tool timeout.

Once a proposal is approved, delete the props, their branches, and the harness
in the same commit that folds the design in, then squash, so the harness does
not land on `main`. `preview-party-states.html` stays; it is the gallery of
every party state.

## Where the shipped half lives

`PartyBar` (Play together / Play Online / `WayOut` recovery control),
`PlayingAs` + `TicketList` + `PlayerBooth` (one name, one verb, one
instruction), `Menu` (`.cont` Continue rows from each game's `savedGames()`
hook; `.mirror-door`; poster scroll-into-view), `tokens.css` (88px bottom
reserve), `app.css` (`.cont*`, `.mirror-door`, `.tk-poster` scroll-margin).
