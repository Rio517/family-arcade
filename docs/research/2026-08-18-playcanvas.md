# PlayCanvas — a fit for the arcade?

**Question:** [PlayCanvas](https://playcanvas.com/) looks interesting. Can we
use it instead of Blender and three.js? Or in addition to them?

**Short answer:** It replaces neither today. PlayCanvas competes with
*three.js*, not with Blender — and swapping three.js out would be a rewrite of
working, tuned scenes for no player-visible gain. The genuinely interesting
part is its collaborative browser editor, which is the thing to remember if we
ever build a *bigger* 3D game. Details and the honest caveats below.

## What PlayCanvas actually is

Three layers that are easy to conflate:

1. **The engine** — an MIT-licensed JavaScript 3D engine
   ([github.com/playcanvas/engine](https://github.com/playcanvas/engine)),
   installed from npm with full TypeScript declarations. Same layer of the
   stack as three.js, but higher-level and batteries-included: an
   entity-component system, physics, audio, animation state graphs, input,
   and a glTF asset pipeline are all built in. It was among the first
   production engines with full WebGPU support (compute shaders included)
   while keeping WebGL2 compatibility. Usable completely standalone, no cloud
   involved.
2. **The editor** — a Unity-like collaborative scene editor that runs in the
   browser at playcanvas.com. This is the platform's real differentiator:
   multiple people arranging a scene together, live, with an asset pipeline
   that auto-compresses textures and models. The editor *frontend* is open
   source, but the backend is PlayCanvas's proprietary cloud service — there
   is no self-hosted editor. Projects live on their servers.
3. **The extras** — [`@playcanvas/react`](https://github.com/playcanvas/react)
   (their answer to react-three-fiber; MIT, ~500 stars, young), HTML web
   components, and [SuperSplat](https://supersplat.playcanvas.com/), their
   well-regarded Gaussian-splat editor.

Pricing for the editor: free tier is *public projects only* (1 GB storage);
private projects need Personal at $15/month. Finished builds can always be
downloaded and self-hosted — and stay up if you cancel — but cancelling locks
private *projects* (the editable source) until you resubscribe or make them
public.

## Why it doesn't replace Blender

PlayCanvas has no modeling tools — no sculpting, no retopo, no UV unwrapping.
It *imports* GLB files that were authored somewhere else, exactly like our
three.js pipeline does. Blender (or wherever our artist works) stays in the
picture under every scenario. The Blender → GLB → optimizer → app flow we've
built is engine-agnostic; nothing about it would change.

## Why it doesn't replace three.js (for us)

On paper it could — it's the same slot in the stack, arguably a nicer one.
In practice, for this project:

- **We'd be rewriting finished work.** ChessScene, FleetScene, and Track3D
  are shipped, family-tuned (grey regrades, cockpit glass, hover ladders,
  zoom limits), and covered by the fallback-testid pattern. A port buys the
  players nothing.
- **Our 3D needs are small.** Board-game dioramas with a fixed orbit camera,
  a handful of GLB props, and procedural geometry. three.js is the
  right-sized dependency; PlayCanvas's ECS, physics, and animation graphs
  would sit unused. Neither library is a clear bundle-size win, and we
  already lazy-load the 3D chunk (ADR 0006).
- **The editor workflow rubs against our invariants.** We're offline-first
  with no runtime downloads and no third-party services (ADRs 0003, 0004).
  The standalone engine honors that fine, but the standalone engine without
  the editor is just… a different three.js, with a much smaller ecosystem of
  examples, StackOverflow answers, and AI training data to lean on.
- **The tempting hybrid is a dead end.** The obvious "use it in addition"
  idea — compose scenes visually in the free editor, export GLB, feed our
  existing pipeline — doesn't work: the editor imports glTF but **cannot
  export scenes to GLB/glTF**. It's a one-way door into their runtime
  ([long-requested](https://github.com/playcanvas/playcanvas-gltf/issues/86),
  still absent as of mid-2026).

## When we *would* reach for it

Worth revisiting if any of these become true:

- **A bigger, level-based 3D game.** If the family ever wants a proper
  explore-a-world game, the editor changes the math: the kids could place
  objects in a browser editor themselves (a free public project is fine for
  us) and we'd ship the downloaded build to Pages. Collaborative
  level-editing by non-coders is the one thing our stack flatly cannot do,
  and for this family it's the killer feature.
- **Gaussian splats.** If we ever want a photoreal scanned scene (the family
  couch as a game board?), SuperSplat is best-in-class and worth using
  regardless of engine.
- **Declarative React 3D.** If our imperative scene classes ever grow
  painful, the mature move on our current stack is react-three-fiber, not
  `@playcanvas/react` — same idea, far bigger ecosystem, no engine swap.

## Verdict

Keep Blender + three.js for the arcade. PlayCanvas is a credible, healthy
project (MIT engine, strong WebGPU story), but for us it's a lateral engine
move with a real migration cost, a smaller ecosystem, and a cloud editor we
can't self-host and whose one attractive integration point (GLB export)
doesn't exist. File under "first candidate if we ever build something bigger
than a board game."

## Sources

- [PlayCanvas](https://playcanvas.com/) · [engine repo](https://github.com/playcanvas/engine) · [engine docs (standalone use)](https://developer.playcanvas.com/user-manual/engine/)
- [Pricing & plans](https://playcanvas.com/plans)
- [Editor repo (frontend only; backend is their cloud)](https://github.com/playcanvas/editor)
- [`@playcanvas/react`](https://github.com/playcanvas/react)
- [glTF import announcement](https://blog.playcanvas.com/gltf-import-arrives-in-the-playcanvas-editor/) · [scene-export feature request](https://github.com/playcanvas/playcanvas-gltf/issues/86) · [2024 forum thread confirming no export](https://forum.playcanvas.com/t/help-needed-exporting-scene-from-playcanvas-to-fbx-or-gltf/36059)
