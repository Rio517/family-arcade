# Caribbean naval POC review

## Decision

**Proceed to a five-minute vertical slice.** The POCs prove the riskiest
technical and presentation assumptions: an original Blender-authored sailing
ship can stay tiny and readable in-browser; deterministic broadside/wind rules
can remain independent of Three.js; and a dedicated battle scene can carry a
distinct visual identity across desktop, tablet, and phone.

Do not build a second ship yet. The highest-value next investment is the
port → provisions/rumour → sail → battle → capture → shipyard loop using the
sloop on both sides. That slice will tell us whether the full product is a
strong income-replacement bet; more isolated assets will not.

## What exists

- Playable harness: `/preview-caribbean.html` while `npm run dev` is running.
- Debug metrics: `/preview-caribbean.html?debug=1`.
- Pure naval domain with 29 focused tests across battle and opponent logic.
- Scripted Blender 5.2 sloop builder, `.blend`, standardized renders, raw GLB,
  optimized GLB, and machine-readable report.
- Three.js scene with optimized GLB loading, runtime material batching, sea,
  weather colour, islands, wind streamlines, wakes, projectiles, smoke,
  responsive cameras, touch/keyboard controls, pause, and reduced motion.

## Evidence

### Sloop

- [320 px six-view contact sheet](../../screenshots/caribbean-poc/sloop-contact-sheet-320.png)
- [Full six-view contact sheet](../../screenshots/caribbean-poc/sloop-contact-sheet.png)
- Generator: `tools/caribbean-sloop/build_sloop.py`
- Rebuild instructions: `tools/caribbean-sloop/README.md`

The silhouette reads as a one-masted small sailing craft from side, bow,
stern, top, and both three-quarter angles. A long bowsprit, fore-and-aft
mainsail, headsail, low hull, tiller, small broadside battery, and working deck
survive the 320 px gate. The two-sided signal chevron and command pennant add
redundant team readability.

The model is an original stylized design, not a reconstruction of a named
vessel. Historical review with museum/reconstruction references is still
required before calling the rig final.

### Browser battle

- [Desktop 1440×900](../../screenshots/caribbean-poc/battle-desktop-final.png)
- [Tablet landscape 1180×820](../../screenshots/caribbean-poc/battle-tablet-landscape.png)
- [Tablet portrait, reduced motion, 820×1180](../../screenshots/caribbean-poc/battle-tablet-portrait-final.png)
- [Phone 390×844](../../screenshots/caribbean-poc/battle-phone-final.png)

The captures use seed 1702 and the production harness build, not the dev
server. Automated checks found no console errors, asset request failures,
overflow, scroll beyond the viewport, or dev-tool overlays.

## Measurements

### Asset pipeline

| Metric | Result | Gate | Status |
| --- | ---: | ---: | --- |
| Blender version | 5.2.0 LTS | Recorded | Pass |
| Semantic nodes | 79 | Hull/sail/rudder/guns/rig retained | Pass |
| Mesh instances | 72 | Recorded | Pass |
| Rendered triangles | 2,005 | <15,000 | Pass |
| Raw GLB | 170,068 bytes | Recorded | Pass |
| Optimized GLB | 56,864 bytes | <250 KB | Pass |
| Geometry after optimization | 2,005 triangles | No loss for authored art | Pass |
| Materials | 9 | Names retained | Pass |
| External textures | 0 | Offline/self-authored | Pass |

The existing optimizer reduced the file by 66.6% through pruning, deduplication,
and Meshopt while preserving every triangle, 79 nodes, and 9 material names.

### Browser scene

All measurements below came from headless Chromium's software Vulkan renderer
(`ANGLE` + `SwiftShader`), not the Mac's or an iPad's hardware GPU. They are a
conservative automation signal, not a substitute for device profiling.

| View | FPS sample | Draw calls | Visible triangles | Errors |
| --- | ---: | ---: | ---: | ---: |
| Desktop 1440×900 | 35–43 | 39 | 7,886 | 0 |
| Tablet landscape 1180×820 | 51–53 | 39 | 7,886 | 0 |
| Tablet portrait 820×1180, reduced motion | 47–56 | 39 | 7,886 | 0 |
| Phone 390×844 | 70–80 | 39 | 7,886 | 0 |

The first integrated pass cost 173 draw calls and ~16,900 triangles. Runtime
material batching and lower water tessellation brought that to 39 calls and
7,886 triangles without changing the GLB or throwing away its semantic
parts. This is the right division: retain art structure on disk; optimize a
non-animated runtime presentation clone.

Desktop misses the provisional 50 FPS automation gate under SwiftShader.
Because tablet sizes reach or hover around it in software and draw/triangle counts
are modest, the next action is a real iPad measurement—not further blind
quality reduction. Hardware must sustain 50+ FPS at an adaptive pixel ratio
before production naval combat exits alpha.

## Interaction proof

Playwright exercised the rendered controls rather than calling domain helpers:

- port fire immediately disabled only the port battery;
- the battery returned after six simulation seconds;
- chain shot updated the selected/pressed state;
- pause opened an accessible modal and froze simulation;
- return-to-deck resumed; and
- keyboard rudder input was accepted with no browser errors.

Domain tests separately prove point-of-sail speed, reefed handling, port versus
starboard bearing, independent reload, round/chain/grape profiles, surrender,
sinking, escape, pause, deterministic replay, AI broadside choice, reload
respect, ammunition choice, and damaged retreat.

## Visual review log

### Pass 1 findings

1. Hull vanished into shadow in the Blender views.
2. Team chevron showed only from port.
3. Filled wake wedge looked like a second sail on the water.
4. Wind-rose guide line crossed the combat subjects.
5. Blender nodes produced 173 runtime draw calls.
6. Portrait camera pushed both ships outside the narrow frustum.

### Corrections

1. Raised hull chroma/exposure while preserving the dark maritime base.
2. Added separate port and starboard chevrons.
3. Rebuilt wake as thin wire-like foam rails with lower opacity.
4. Shortened the wind-rose guide while keeping it as the signature motif.
5. Batched the runtime clone by nine materials; the exported node graph stays
   untouched for future animation and damage.
6. Added a higher, engagement-centred portrait/phone camera with adaptive FOV.

### Remaining art/product questions

- In battle the POC camera favors tactical readability over cinematic height.
  A brief lower entry shot may add drama, but control must return to the
  readable camera before input begins.
- Rings make player/enemy identity unmistakable but are still visibly “game
  UI.” Test a subtler wake/flag/outline combination before production locks
  them in.
- Smoke reads clearly but needs pooled shader sprites before dozens of guns or
  fort batteries enter.
- The phone view proves adaptability, not primary comfort. Tablet landscape is
  the lead interaction target.

## Risks not yet proved

- Real iPad GPU/thermal performance and Safari WebGL behaviour.
- A full two-to-four-minute battle's tactical pacing and AI quality.
- Capture decision, fleet comparison, and the emotional reward of taking a
  ship.
- Overworld-to-battle camera/context handoff.
- Offline service-worker precache of this harness-equivalent production chunk.
- Audio latency, mixing, cannon impact, and reduced-sensory options.
- Historical review of the sloop rig and eventual ship-class labels.
- Full 14 px product typography at the densest phone layout; the POC uses some
  compact telemetry labels and should not be copied wholesale into production.

## Recommendation

Build the vertical slice on a new production module after this POC branch is
reviewed. Reuse the pure battle concepts and asset script, but treat the harness
HUD as a tested direction rather than a finished component library. The
production slice should include one port, two cargo opportunities, one direct
rumour, strategic sailing, one opponent, capture, repair/refit, and a return to
the same port. Measure whether a first-time player understands and enjoys that
loop before expanding content.
