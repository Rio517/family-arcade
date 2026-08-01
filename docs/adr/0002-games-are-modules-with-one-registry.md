# 2. Games are self-contained modules behind one registry

Status: Accepted

## Context

The arcade holds several unrelated games (Ship Battle, Chess, Risk, Magic Coins,
Rainbow Racer) and gains more over time. We want adding or removing a game to be
a local, low-risk change, and we don't want the app shell to know game-specific
details.

## Decision

Each game lives in `src/games/<id>/` with its own `domain/` (pure rules, no
DOM/network/storage), `components/`, `state/`, `storage/`, and `styles/`. A game
exposes a single `GameDescriptor` (id, title, tag, route, icon, page component).

`src/app/registry.ts` is the **only** place that lists games. The landing page
and router are generated from it — nothing else hard-codes a game. Shared code
lives in `src/shared/`, and **shared never imports a game**.

## Consequences

- Adding a game = one folder + one line in the registry; the menu updates itself.
- Pure `domain/` layers are unit-testable without a browser.
- The dependency rule (shared never imports games; games don't import each other)
  has to be actively respected — it's the thing that keeps modules independent.
