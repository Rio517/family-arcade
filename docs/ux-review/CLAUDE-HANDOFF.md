# Claude handoff: Family Arcade UX flow corrections

Date: 2026-08-31

## Your role

Act as a senior product designer who can implement React UI. Improve the flow, clarity, and discoverability of the Kny-Flores Family Arcade without redesigning it.

The previous generated-image and hand-built HTML mockups were rejected. They drifted from the product, introduced strange icons, changed ticket geometry, crowded the footer, and made the app look like a different arcade. Do not use `docs/ux-review/imagegen/`, `docs/ux-review/boards/`, or the current `docs/ux-review/index.html` as visual references. They are failure evidence only.

Build the review in the real app, from the latest production components and CSS.

## Product and audience

This is an offline-first PWA used by one family on iPads and phones. The players include two young daughters, a son who likes Star Wars and 3D, and two parents. The important usability test is: a six-year-old should understand what to tap without a manual.

Games include Chess, Ship Battle, Risk, Rainbow Racer, Magic Coins, Yahtzee, Caribbean, and Magic Mirror. Multiplayer is peer-to-peer. Do not introduce accounts, a discovery service, or any server dependency.

## Non-negotiable visual contract

Preserve the existing “Midnight Carnival” system exactly:

- dark navy night, striped awning, coloured bulb string, orange neon family sign on chains;
- existing ticket cards, including their shape, colour, striped stub, open poster, preview image, spacing, and typography;
- existing fonts, colours, tokens, line weights, and layout character;
- the repository’s real line-style SVG icon components only;
- no emoji, Unicode stand-ins, CSS-drawn icons, generated game art, fake screenshots, or newly invented card styles;
- text at least 14 px and tap targets at least 44×44 px;
- reduced-motion support for every animation;
- good use at 430×932 and 1180×820.

This is a behavior and hierarchy pass, not an aesthetic exploration.

## Repository safety and starting point

Read `AGENTS.md` and `CLAUDE.md` completely before working.

The checkout observed when this handoff was written was on stale `main` at `d11fb81`, about 96 commits behind `origin/main`, with untracked work under `docs/ux-review/`. Do not implement against that stale HEAD and do not delete or overwrite the untracked review artifacts.

Start a fresh branch or worktree from the latest `origin/main`. Inspect status and fetch first. If the repository state has changed, use the same principle: base the work on current `origin/main` and preserve unrelated user changes.

The latest relevant production code is expected to include:

- `src/app/Menu.tsx` and `src/app/styles/app.css`
- `src/app/PlayerBooth.tsx`
- `src/app/registry.ts`
- `src/shared/profile/PlayingAs.tsx`
- `src/shared/profile/TicketList.tsx`
- `src/shared/profile/TicketStrip.tsx`
- `src/shared/profile/PlayerGate.tsx`
- `src/shared/profile/player.css`
- `src/shared/party/PartyBar.tsx`
- `src/shared/party/FloatingVideo.tsx`
- `src/shared/party/PartyContext.tsx`
- `src/shared/party/party.css`
- `src/shared/ui/icons.tsx`
- `src/games/chess/components/ChessPage.tsx`
- `src/games/mirror/components/MirrorPage.tsx`
- `src/app/preview-party-states.tsx`
- `src/app/preview-lobbies.tsx`
- `scripts/screenshots.mjs`

Also read ADRs 0003, 0004, 0007, 0008, and 0010 before changing party, video, camera, or offline behavior.

Open the committed screenshots under `docs/screenshots/` at original resolution before designing. In particular inspect:

- `arcade-landing-phone.png` and `arcade-landing.png`
- `arcade-ticket-open-phone.png` and `arcade-ticket-open.png`
- `party-panel.png`, `party-states.png`, and `party-effects.png`
- `party-invite.png` and `party-knock.png`, if present
- `chess-party-host.png`
- `battle-party-guest.png`
- `player-gate.png`
- `mirror-page.png` and `mirror-effects.png`, if present

## Review artifact, not a speculative mockup

Create a build-only review page such as `preview-ux-review.html` with a React entry such as `src/app/preview-ux-review.tsx`. Follow the existing preview harness conventions and `BUILD_HARNESS` gate.

The review page must render production components, production CSS, real registry icons, and real committed preview images. Do not reproduce tickets, party controls, or video windows in one-off HTML/CSS.

For every proposal, provide:

1. a “Today” frame showing the unchanged production state;
2. a “Proposed” frame with the working change;
3. a one-sentence child-centered reason;
4. an impact/effort label.

Show every new proposal in an exact 1180×820 iPad viewport. Also show 430×932 when the problem is phone-specific or responsive behavior materially differs. Put proposal numbers, labels, and annotations outside the simulated app viewport so they never cover the UI Mario is judging.

The proposed frames should be interactive where meaningful. At minimum Mario must be able to:

- open and close a ticket’s details;
- use the ticket’s primary action;
- open the player picker and switch a fixture player;
- open and collapse every Play Together state;
- move from the initial pairing state to code states;
- expand the small call window into the full call;
- observe the bottom clearance with an open poster.

Serve the review page with the repository’s normal Vite/Tidewave workflow, keep it running, and give Mario the exact local URL. Do not ask him to review a collection of PNGs when a real-component state can be shown live.

## Approved direction and exact feedback

### 1. Player identity

Unify all identity entry points around the existing `TicketList`; do not invent another picker.

- Compact identity control: player name plus `Switch player ›`.
- Do not add “Playing as”.
- Picker instruction exactly: `Pick your player or type your name.`
- Remove explanatory copy shown after choosing.
- The gate, lobby identity control, and Ticket Booth must lead to the same picker and use the same action wording where context permits.
- Keep the existing ticket/profile visuals.

Child benefit: one name and one consistent verb make changing players predictable.

### 2. Play Together entry and pairing

Keep the global control floating. Do not turn it into a large permanent navigation/footer bar and do not auto-hide it while scrolling.

- Collapsed label: `Play together`.
- Open panel title: `Play Online`.
- First state has two single-line actions: `Start Pairing` and `Enter Code`.
- Do not use “Party” as the primary child-facing label.
- Do not ask “What do you see on the other iPad?”
- Do not front-load a code before the child chooses what to do.
- Once a code is created, keep it visible through waiting and relevant reconnect/error states.
- Every panel state, including waiting, reconnecting, error, and connected, is collapsible.
- Preserve peer-to-peer architecture and current automatic game seating inside an established connection.

Child benefit: the first screen names the goal and offers two concrete actions.

### 3. Reconnection and leaving

Use short, warm, state-specific copy. Do not explain networking.

- Never hide a still-useful current code.
- Reconnecting/error states need a clear `Leave` action.
- They also need a recovery choice appropriate to the state, such as retrying, getting a new code, or entering a different code.
- Avoid modal dead ends and avoid forcing a reload.
- Keep all targets at least 44 px and preserve collapse access.

Child benefit: a child can get unstuck by recognizing one short action instead of reading a paragraph.

### 4. Game invitations and knocks

Use the existing floating Play Together control and party panel; do not introduce a new notification component unless the current component truly cannot carry the state.

- Approved invitation wording: `Kai opened Chess — Join ›`.
- Make this state visibly distinct using existing tokens, iconography, glow, and component affordances—not a new colour or an outer card.
- Keep knock copy equally short, for example `Rainbow Racer?` if that is still the established behavior.

Child benefit: the friend, game, and action are readable as one sentence.

### 5. Game lobby language

Change the mode titles to exactly:

- `Play here`
- `Play Online`
- `Free Board`

Keep the actual lobby cards, real icons, descriptions, and layout. Do not create simplified replacement cards.

Child benefit: each title says where or how play happens in familiar words.

### 6. Landing priority and saved games

Add a returning-player shortcut before the game catalogue while preserving the full existing ticket catalogue and previews.

- For a single save, remove the outer Save Station box/header and show one unboxed row using the real game icon on the left and `Continue Chess ›` as the action.
- Generate the row from real save/registry data; do not hard-code Chess in production.
- If multiple saves exist, use the same unboxed row pattern for each. Do not invent a new card family.
- Play Together remains floating.

Child benefit: a returning child sees the most likely next action before scrolling through every game.

### 7. Bottom overlap on phones

Preserve the complete open ticket poster and its preview section. The rejected simplified cards are explicitly out of scope.

- Reserve enough bottom clearance/safe-area space that the floating Play Together control never covers a ticket poster’s Play action or another page’s last action.
- Validate on a real 430×932 viewport, including `env(safe-area-inset-bottom)` behavior.
- Do not solve this by hiding the control during scroll.
- Keep the solution visually quiet; it should feel like spacing, not a new toolbar.

Child benefit: the action they just revealed remains visible and tappable.

### 8. Video-call discoverability

Reuse `FloatingVideo`; do not redesign the call surface.

- Add an unmistakable expand/full-screen affordance to the small call window using the repository’s existing SVG icon and a 44 px target.
- Keep tap-anywhere-to-expand if it already works, but do not rely on that invisible behavior alone.
- Increase the self-preview from the current 42 px to a useful but proportionate size; verify it does not obscure the friend video or phone controls.
- Effects controls belong only in the full-screen call.
- Do not put effect chips, “Magic” controls, proposal numbers, or explanatory annotations on the small call window.
- Ignore the old proposal labelled 9.3; Mario found it unclear and it is withdrawn.

Child benefit: the small window visibly tells the child how to make the call big.

### 9. Magic Mirror home

The desired direction is consolidation, not a new destination style.

- Do not call it `Playable`.
- Keep the existing Magic Mirror page and its established copy and effects.
- Replace the duplicate “Try the effects on your own” wording with one single-line `Magic Mirror ›` action using the real camera icon.
- Preferred review placement: a quiet, persistent action at the bottom of the Play Online panel, below video controls when those controls are present. It should read as part of the camera/video area, not as a separate game card and not as a large global footer.
- In the review harness, show this exact placement before removing the Magic Mirror ticket from the production catalogue. Removing that ticket is contingent on Mario approving the consolidated placement.

This is the one remaining placement uncertainty. Do not silently invent a third location. If implementation requires choosing between a Play Online panel footer and an app-wide sticky footer, pause and ask Mario; the panel footer is the current recommendation because the rejected app-wide footer became crowded.

Child benefit: camera effects have one memorable home next to camera controls.

### 10. Ticket tap semantics

Use the real `.tk`, `.tk-face`, `.tk-poster`, and `.tk-play` structure and preserve its shape, poster preview, colour, stub, and animation.

Explore this interaction in the review harness:

- tapping the ticket’s main face performs the primary Play/navigation action;
- a separate, labelled 44 px `Details` control expands or folds the poster;
- the expanded poster keeps its full existing preview and Play action;
- implement valid, accessible interactive markup—do not nest buttons or links;
- provide a reduced-motion fold/open state.

Do not add a vertical Play stub, redraw the ticket, or replace the poster with a compact card. If the real content or route behavior makes face-to-Play unsafe, flag that uncertainty with evidence rather than forcing it.

Child benefit: the biggest target does what first-time users naturally expect, while details remain discoverable.

## Suggested impact-versus-effort ranking

Use this as the initial ranking and adjust only if repository evidence contradicts it:

| Rank | Proposal | Impact | Effort |
|---:|---|---|---|
| 1 | Play Together entry and pairing | Very high | Medium |
| 2 | Consistent player identity | High | Low–medium |
| 3 | Phone bottom clearance | High | Low |
| 4 | Lobby language | High | Low |
| 5 | Reconnection and leaving | High | Medium |
| 6 | Invitations and knocks | Medium–high | Low–medium |
| 7 | Continue-game priority | Medium–high | Medium |
| 8 | Video-call expand affordance | Medium | Low–medium |
| 9 | Ticket tap semantics | Medium | Medium |
| 10 | Magic Mirror consolidation | Medium | Medium |

## Checkpoint discipline

Do not implement the entire set in one pass.

First checkpoint:

1. real-component iPad and phone review harness shell;
2. identity Today/Proposed;
3. Play Together initial, waiting, reconnecting/error, and collapsed states;
4. landing page with the Continue row and phone bottom-clearance case;
5. the impact/effort overview.

Run it locally, provide Mario the live URL, and pause for visual feedback. The goal is to lock the component fidelity, scale, spacing, and panel behavior before expanding into tickets, lobbies, video, invitations, and Magic Mirror.

Do not change production behavior or remove the Magic Mirror ticket until Mario approves the corresponding live real-component proposal. Small refactors that make the production components renderable in a fixture are acceptable if they do not alter runtime behavior.

## Verification and acceptance

Add focused tests for exact copy and interactions rather than snapshotting large DOM trees. Update the screenshot harness once proposals are approved for production.

Before claiming a checkpoint or implementation complete, run the applicable checks from the fresh `origin/main` worktree:

```sh
npm run check
npx vitest run
npm run build
npm run shots -- <relevant filters>
```

Inspect the resulting phone and iPad captures at original resolution. Specifically verify:

- no new colours, fonts, ticket geometry, or icon language;
- no text below 14 px and no target below 44×44 px;
- no floating-control overlap at 430×932;
- all Play Online states collapse;
- code remains visible where recovery needs it;
- player entry points use the same picker and language;
- effects appear only in the full-screen call;
- reduced-motion removes non-essential movement without hiding state changes;
- the PWA remains offline-first and all multiplayer remains peer-to-peer.

Do not commit, open a PR, or deploy production changes unless Mario asks. The deliverable for the first pass is a faithful, live, reviewable HTML implementation using the real app—not another visual reinterpretation.
