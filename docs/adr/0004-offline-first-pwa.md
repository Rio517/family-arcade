# 4. Offline-first PWA, no runtime downloads

Status: Accepted

## Context

The arcade is played on family iPads, sometimes on flaky or no wifi (car, plane).
It ships as a PWA. We want it to work fully offline once loaded, and to load fast.

## Decision

No runtime downloads: no CDN fonts, no fetched 3D models, no remote images.
Everything needed to play is bundled and precached by the service worker. Visuals
that would normally be assets are generated **in code** instead (procedural
three.js geometry, canvas-drawn textures — see ADR 0006).

## Consequences

- Works on an airplane; nothing breaks when a third-party CDN is down.
- Assets-as-code keeps the bundle self-contained but pushes some visual work into
  geometry/canvas rather than image files.
- The service worker serves the last build until the app is fully closed and
  reopened — a known "I don't see my change yet" gotcha after a deploy.
