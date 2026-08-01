# 1. Record architecture decisions

Status: Accepted

## Context

This arcade is built almost entirely through short AI pair sessions. Each
session starts cold, and the important architectural choices (how games plug in,
how multiplayer works, why there's no server) were previously only implied by
the code and a few lines in `CLAUDE.md`. That makes them easy to re-litigate or
accidentally break.

## Decision

Keep lightweight Architecture Decision Records in `docs/adr/`, one file per
significant decision, numbered and append-only. When a decision changes, add a
new ADR that supersedes the old one rather than editing history.

A decision is "significant" if reversing it would touch many files or surprise a
future contributor — not every small implementation choice.

## Consequences

- A new session can read `docs/adr/` to understand the *why*, not just the *what*.
- `CLAUDE.md` stays the quick operational guide; ADRs hold the reasoning.
- Small overhead: meaningful changes should come with an ADR.
