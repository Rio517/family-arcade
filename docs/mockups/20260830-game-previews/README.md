# Game previews — three ways (2026-08-30)

**Product direction:** don't ask for a player's name until after a game is
picked, and give a child who doesn't know a game a way to see what it is
before committing to it.

Open [`game-previews.html`](./game-previews.html) directly from disk.

## The three options

| | Option | What it did |
|---|--------|-------------|
| A | **Peek sheet** | A tap slid a sheet up from the bottom with the screenshot and facts; the ticket stayed put behind it. |
| B | **Poster strip** | The ticket grows in place into a poster: a wide screenshot strip, the facts, the blurb, and Play. |
| C | **Attract mode** | Tickets cycled their own screenshots on the landing page, like an arcade cabinet. |

**Decision: B, poster strip.** It stays one object instead of two, needs no
new surface, and gives `Play` somewhere to live inside the poster.

Shipped in `GameTicket` (`src/app/Menu.tsx`): `ticket-open-<id>` opens
`ticket-poster-<id>`, one poster is open at a time, and Escape folds it.

## Still open

It is ambiguous whether a ticket tap means play or preview. The face opens the
poster and `Play` sits inside it, so a tap currently means "show me". The
candidate fix is proposal 1 of the [party-UI pitch](../20260831-party-ui/):
the ticket face plays, and a labelled `Details` control folds the poster out.
It has not been built.
