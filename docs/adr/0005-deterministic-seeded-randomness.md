# 5. Deterministic, seeded randomness

Status: Accepted

## Context

Randomness appears in two places: gameplay (dice, coin/spawn placement) and
generated scenery (starfields, clouds, hull plates). For event-sourced
multiplayer both devices must derive the *same* world, and for tests we need
repeatable outcomes.

## Decision

Any randomness that affects appearance, tests, or shared state comes from a
**seeded generator** (small LCG / mulberry32) with the seed passed in — never a
bare `Math.random()` in the pure `domain/` layers. Pure functions take an `rng`
argument so callers control it; production passes `Math.random`, tests pass a
fixed seed, and shared/generated scenery uses an explicit seed.

## Consequences

- `domain/` logic is deterministic and unit-testable with seeded RNGs.
- Two peers can generate identical scenery/worlds from the same seed.
- Discipline required: reach for an injected `rng`, not `Math.random`, inside
  pure rules.
