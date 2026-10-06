# arcade-physics (copied, don't edit here)

Cosmetic rigid-body physics on Rapier: things that fall, stack and bounce (sweets, coins, crates, tyres, containers, debris). View layer only; loads Rapier lazily and falls back to simple ballistic motion if WASM fails.

Source: family-arcade/studio `kit/physics/` at 0c3fa62 2026-10-06 (see VERSION). Docs and the gallery live there.
To change it, change the kit, then reinstall into this game:

    node ~/code/arcade/studio/kit/install.mjs physics <this repo>
