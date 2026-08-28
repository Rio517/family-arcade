# Caribbean sloop asset loop

The Python file procedurally builds the original POC sloop in Blender, renders
six fixed review views, saves an editable `.blend`, exports a raw GLB, and
writes a report. No external mesh, texture, or downloaded asset is used.

From the repository root:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  --python tools/caribbean-sloop/build_sloop.py

npm run glb -- \
  tools/caribbean-sloop/output/caribbean-sloop.raw.glb \
  --out src/games/caribbean-poc/assets
```

The optimizer names its result `caribbean-sloop.raw.opt.glb`; rename the
approved result to `src/games/caribbean-poc/assets/caribbean-sloop.glb` only
after checking its report and the browser harness.

## Review order

1. Open `output/contact-sheet-320-crops.png` or resize the six renders to 320
   px. Reject silhouette problems before adding details.
2. Inspect side, bow, stern, top, and both three-quarter renders at full size.
3. Check `asset-report.raw.json` for unexpected object or triangle changes.
4. Run the optimizer and verify every triangle, node, and material name remains.
5. Open `/preview-caribbean.html?debug=1` and capture the same battle seed at
   desktop, tablet landscape, tablet portrait, and phone dimensions.
6. Change one art question at a time, rebuild, and compare identical views.

## Model conventions

- Blender units are metres; +Z is up; the authored bow points +Y.
- `CC_Sloop` is the root.
- Hull, sails, rudder, guns, and rig use stable semantic names.
- `Signal Vermilion Team` is the runtime-tinted material.
- The optimizer must preserve the node graph even if the renderer batches a
  non-animated clone by material.
- Review geometry and transient generated outputs live in `output/` and are
  regenerated. The approved optimized GLB and selected screenshots are tracked.
