# 6. Procedural 3D with lazily-loaded three.js

Status: Accepted

## Context

Some games are 3D (Chess, Ship Battle effects, Rainbow Racer); most are 2D. We
want rich 3D without shipping heavy downloads (ADR 0004) and without making 2D
players pay for three.js they never use.

## Decision

All 3D is **procedural** three.js — lathe/extrude/box/cone geometry and
canvas-generated textures built in code, no fetched models or images. three.js is
loaded via `React.lazy`, so its chunk downloads only when a 3D game opens; 3D
games share that one chunk. 3D components must **catch scene-construction errors
and render a 2D fallback** (there's no WebGL in the test environment, and some old
devices lack it). Animations are gated behind `prefers-reduced-motion`.

## Consequences

- 2D players never download three.js; 3D stays offline-capable.
- Every 3D view needs a tested fallback path (`*-fallback` testid) for
  no-WebGL environments.
- Procedural art is more code and less flexible than importing a model, which is
  the trade we accept to stay offline and light.
