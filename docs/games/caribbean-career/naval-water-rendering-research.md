# Caribbean naval water rendering research

Date: 2026-08-28

## Product target

The battle camera shows two heavy seventeenth-century ships at board-game scale.
The water therefore needs strong optical depth, a readable horizon, sunlight,
and fine directional surface detail without making the hulls look like speedboats
or toys flying over oversized waves. The existing maximum vertical displacement
of `0.12` world units and restrained hull heave remain the authored scale.

## Reference implementations

### [Abyssal Ocean](https://github.com/squall01337/abyssal-ocean)

MIT-licensed WebGL2/Three.js reference. It uses three non-overlapping
JONSWAP/TMA spectral cascades, 512-square inverse FFT passes, Jacobian-derived
foam, a Preetham sky, GGX sun glitter, screen-space reflection, Beer-Lambert
absorption, subsurface scattering, and a camera-centred radial grid. This is a
convincing full ocean renderer, but its float render targets, multiple GPU
passes, large radial mesh, and per-frame FFT are intentionally far beyond this
game's existing battle-scene budget.

Useful ideas: one coherent sky/water light direction; dielectric Fresnel;
rough sun glitter; depth-colour absorption; small normal detail separate from
large displacement.

### [OceanThreejs](https://github.com/achrefelouafi/OceanThreejs)

MIT-licensed WebGL2/Three.js reference using a hybrid Tessendorf FFT and up to
six Gerstner swells, analytic normals, GGX reflection, Beer-Lambert refraction,
subsurface scattering, and Jacobian foam. Its separation of displacement,
normal detail, and optical shading is the most directly useful architectural
lesson. Its FFT target requirements and cinematic surface pipeline are still
too expensive for the current deterministic two-ship scene.

Useful ideas: analytic wave derivatives, Schlick Fresnel, a restrained GGX
highlight, and colour absorption that makes the surface read as water even
when the silhouette is calm.

### [Poseidon](https://github.com/owenyuwono/poseidon)

MIT-licensed Three.js WebGPU/TSL reference. It runs three disjoint FFT cascades
over 1024/144/24-metre patches, uses JONSWAP/Horvath/TMA/Donelan–Banner wave
models, a roughly 790,000-vertex radial grid, measured Jerlov water optics,
dielectric Fresnel at `n = 1.34`, GGX sun glitter, and Jacobian foam. It is an
excellent quality ceiling but has no WebGL fallback and targets Chrome/Edge
113+ or Safari 18+.

Useful ideas: tropical/coastal inherent colour, physically plausible `F0`, and
letting specular light—not tall geometry—communicate surface motion.

## Decision

Do not transplant any reference implementation or add FFT, WebGPU, render
targets, texture fetches, foam simulation, screen-space reflection, or a denser
mesh in this pass. Preserve the existing 32-by-32 plane and draw-call budget.

Instead:

1. Keep the two existing low-amplitude travelling waves as the only vertical
   displacement.
2. Derive their normal analytically and add two very small analytic
   directional slopes that affect reflection only, not height.
3. Shade with dielectric Schlick Fresnel (`n = 1.333`), a bounded GGX-style sun
   highlight, coastal absorption/scattering colours, and a horizon colour that
   matches the existing sky.
4. Keep the shader texture-free, deterministic, WebGL-compatible, and frozen
   under reduced motion through the existing `uTime` authority.
5. Validate the actual battle view at the original 1440×900 capture size. The
   acceptance question is whether the ships read as heavy and embedded in the
   sea—not whether the water matches the references' simulation complexity.

No source code or assets from the references are copied by this pass.
