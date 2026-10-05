---
title: 'Gulp: playing with friends'
question: What is the one easy path for up to four children to join and play one Gulp round, each on their own device?
status: open
tested_with: family
date: '2026-10-02'
---
# Gulp Universe: playing with friends

**Product direction:** up to four children play one Gulp Universe round, each
on their own iPad or phone. Getting into the round is one easy path. Every
screen asks one thing, in a child's words, and each answer is a big button with
a picture as well as words. The path ends in the full-screen arcade player
select (four slots, 1P to 4P, INSERT COIN and READY!), in the Coin-op look
chosen in [20261001-gulp-hud-depth](../20261001-gulp-hud-depth/).

**What stays the same:** the host picks the map, time and difficulty as the menu
does today. Each child picks a colour, and a taken colour goes to the next free
one. People take computer seats, so each map keeps its number of holes (Town 5,
City 6, Megalopolis 7, Region 9). A shared round cannot be paused: Pause shows
*Keep going* and *Leave round*, and the host of an endless round also gets *End
round*. A code is four letters and never uses I, L or O, so nothing reads like
a 1 or a 0; the keys show the 23 letters that are left.

**Copy rules:** the screens never say "lobby". The word "code" appears only
beside the four letter tiles. Every screen has a clear way back, text is 14px or
more, and every button shows a focus ring.

## The path

1. **Menu.** Two buttons side by side: *PLAY* (yellow, solo, as today) and
   *PLAY WITH FRIENDS* (purple, three holes on it). Nothing else on the menu
   asks about friends.
2. **Friends already linked in the arcade's Play together party.** They need no
   letters.
   - *A linked friend has started a game.* Every linked device's Gulp menu shows
     a big card above the buttons: "Mina is starting a game!" with *Join Mina*.
     A child who is somewhere else in the arcade sees the Play together pill
     light up the same way. One tap puts them in Mina's player select.
   - *The child taps PLAY WITH FRIENDS while a friend is linked.* No question:
     straight to their own player select. The linked friend's slot says "Mina
     is coming…" until Mina taps Join, then READY!. A small link underneath
     reads "Is a friend starting instead? Join their game".
3. **Not linked: one question.** *PLAY WITH FRIENDS* asks one question with two
   answers. The family picks the wording:
   - **Q1, "Who's starting the game?"** with *Me! Friends join me* (a crown) and
     *A friend. I'll type their code* (letter tiles).
   - **Q2, "Do you have a code from a friend?"** with *Yes! I have a code*
     (letter tiles) and *No, I'm starting* (a crown).

   Starting leads to the child's own player select. It shows the four letters
   big, and one line for the other devices: "On the other iPads: Play with
   friends, then A friend (Q1) or Yes (Q2), then type K Q Z T". START stays off
   until someone joins, and a note says how many computer holes are left. The
   other answer leads to *INSERT CODE*, with big tap-keys for the 23 letters (a
   keyboard works too) and GO!.
4. **After joining by letters.** The same player select, with the guest's own
   slot outlined, a colour picker and a note about the colour swap. The host's
   settings are shown but cannot be changed. A child who arrives through *Join
   Mina* sees the same screen.
5. **The round and the results,** as in the cabinet look: *RECONNECTING…* when a
   link drops, *WAITING FOR {HOST}* with the seconds left when the host drops,
   the pause card, and one results card with every child's standing among all
   the holes plus this device's own tiles.

## What it costs

All of it draws with CSS and inline SVG in the Coin-op look, with the game's
two bundled fonts. The lobby behaviour comes from the play-together plan and
does not depend on the picture: the seat messages, seat tokens, the four-letter
code, reconnect and host-drop handling, and results with several children.

| Piece | Work |
|---|---|
| Menu | The play row becomes two big buttons. One new card above them for a linked friend's invitation, and the same message on the Play together pill. About 60 lines of `gulp.css`, small changes in `GulpMenu.tsx`. |
| Question screen | One new full-screen component with two big answer buttons. Q1 and Q2 differ only in text and button order, so choosing one costs nothing extra. |
| Player select | The largest piece: a full-screen component with slot cards, the marquee sign, the settings bar and START. It serves the host, the linked friend and the guest. About 300 lines of `gulp.css`. |
| Letter entry | A letter-key component (23 keys, delete) and four tiles; it also listens to the hardware keyboard and ignores I, L, O and digits. |
| Round states | The *Reconnecting…* banner, the host-left screen and the pause card are small HUD pieces. |
| Linked friends | The party must tell every linked device that a friend opened Gulp, so the menu card and the pill can light up. This is part of the party work in the plan, not extra for the picture. |

Solo players see one change: *PLAY* is a bigger button beside *PLAY WITH
FRIENDS*. Screenshot states for each screen follow the party-states gallery
pattern.

## The page

[play-together.html](./play-together.html) opens from disk. It lists every
screen in path order, each at iPad 1180×820 and phone 430×932. *Size* scales
the pictures (Fit, Large, Full size). *Instructions follow* picks which question
wording the "On the other iPads" line uses. On the letter screen the keys type
into the tiles. The names, scores and letters in the pictures are examples. The
city behind the screens is the pair of round captures from the HUD pitch
(`frame-ipad.webp`, `frame-phone.webp`); the fonts are `gulp-rounded.woff2` and
`gulp-pixel.woff2`, with the licence in `OFL.txt`.

## Outcome

**Pending.** Not yet chosen; the open choice is the question wording, Q1 or Q2.
