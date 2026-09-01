# Game previews — three ways (2026-08-30)

**Product direction:** don't ask for a player's name until after a game is
picked, and give a child who doesn't know a game a way to be sold on it. A
teaser matters — someone should be able to just *see* what a game is before
committing to it.

Open [`game-previews.html`](./game-previews.html) straight off disk.

## The three options

| | Option | What it did |
|---|--------|-------------|
| A | **Peek sheet** | A tap slid a sheet up from the bottom with the screenshot and facts; the ticket stayed put behind it. |
| B | **Poster strip** | The ticket grows in place into a poster — a wide screenshot strip, the facts, the blurb, and Play. |
| C | **Attract mode** | Tickets cycled their own screenshots on the landing page, like a real arcade cabinet. |

**Decision — B, poster strip.** It reads as one object rather than two, needs
no new surface, and the poster is where `Play` can live so the ticket face
never has to mean two things at once.

Shipped: `GameTicket` in `src/app/Menu.tsx` (`ticket-open-<id>` opens
`ticket-poster-<id>`; one poster open at a time; Escape folds it).

## Still open

The unresolved half of this pitch: it is ambiguous whether a ticket tap means
*play* or *preview*. The face opens the poster and `Play` sits inside it, so a
tap reads as "show me" rather than "start". Option 1 of the
[party-UI pitch](../20260831-party-ui/) — ticket face plays, a labelled
`Details` control folds out — is the candidate fix and has not been built.
