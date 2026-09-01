# Party & player UX (2026-08-31)

**Product direction:** the visual design is fine; the UX is what needs work.
Ten proposals came back from the review. Six shipped in
[#145](https://github.com/Rio517/family-arcade/pull/145); four are still open.

There is no HTML page in this folder on purpose — see *How it was reviewed*.

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
| 10 | The Magic Mirror moves out of the catalogue into the global controls | shipped as a *second* door, not a move |

One amendment came out of the review: the Magic Mirror should be reachable from
more than one place. Hence 10 landing as a second door — the catalogue ticket
and the Play Online panel's door both stay.

Boundaries the pitch kept, and which still apply: no new colour, font, server,
account, or discovery mechanism; reuse the existing ticket, picker, booth,
party pill/panel, effect chips and call surfaces; the only new layout rule is
shared bottom clearance on scrollable routes; reduced motion replaces expanding
or pulsing invitation motion with an instant state change; the global control
never auto-hides while scrolling.

## How it was reviewed — and what failed first

**The failure:** the first pass was generated art and hand-built HTML. It
drifted from the product — strange icons, changed ticket geometry, a crowded
footer, a different arcade — and was rejected in review. Roughly 10MB of that
output (`boards/`, `imagegen/`) was never committed; it sits outside the repo
at `~/code/arcade/mockups/archive/20260831-ux-review-rejected/` if the negative
evidence is ever wanted. Its lesson is the first rule in
[../README.md](../README.md).

**What worked:** a build-only harness that rendered the **real production
components** as Today-beside-Proposed frames — each proposed state the same
component behind an opt-in `proposed` prop (default off), so nothing shipped
while it was being judged. Fixtures were embedded as `<iframe>`s at exactly
1180×820 and 430×932 so media queries and safe areas stayed honest; a scaled
div lies about both. It was served over Tailscale HTTPS, because review happens
on whatever device is to hand — often remote — and the camera surfaces need a
secure origin:

```sh
export PATH="$HOME/.local/share/mise/installs/node/20.20.2/bin:$PATH"   # Node 20
BUILD_HARNESS=1 npx vite build
nohup python3 -m http.server 4322 --bind 127.0.0.1 --directory dist \
  > /tmp/arcade-static.log 2>&1 & disown
tailscale serve --bg 4322     # https://marios-mac-mini.taila17368.ts.net/
```

`vite preview` answers 403 behind that proxy (unfamiliar Host header), which is
why the plain Python server is used. Don't run the server as a background
*tool* task — it dies at the tool timeout, which took the review down twice.

On approval the props, their branches and the harness were deleted in the same
commit that folded the design in, and squashed, so the harness never landed on
`main`. `preview-party-states.html` remains as the living gallery of every
party state.

## What shipped, concretely

`PartyBar` (Play together / Play Online / `WayOut` recovery control),
`PlayingAs` + `TicketList` + `PlayerBooth` (one name, one verb, one
instruction), `Menu` (`.cont` Continue rows from each game's `savedGames()`
hook; `.mirror-door`; poster scroll-into-view), `tokens.css` (88px bottom
reserve), `app.css` (`.cont*`, `.mirror-door`, `.tk-poster` scroll-margin).
