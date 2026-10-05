# Assets: 3D, 2D and audio

Checked 2026-10-03. Paths are relative to the repo root unless they say
otherwise.

## Pick the tool

| Need | Tool | When |
|---|---|---|
| Boards, props, scenery, a whole city | Procedural three.js kit in code (lathe, extrude, canvas textures, seeded LCG) | The default. Gulp's whole city (90 kinds, people, vehicles) is procedural: no GLB anywhere in `src/games/gulp`. Tiny bundle, deterministic, one test per kit. |
| A hero model seen up close (a ship, an animal, a mask) | A concept-art model as the artist, Blender headless with versioned Python scripts | Anything the family looks at closely. Proven on galaxy ships, racer animals, dragon masks, the Caribbean sloop. Needs Blender (5.2 LTS was used) and `codex exec` or another artist agent. |
| Live, exploratory Blender work with a human watching | Blender MCP (below) | One-off scene inspection, pulling a CC0 HDRI or texture. Freeze the result into a script before it becomes a drop. |
| Throwaway props, image-to-3D | `threejs-3d-generator` (Tripo) | Prototypes only; output needs `npm run glb`. Needs `TRIPO_API_KEY`. |
| Concept sheets, textures, sky plates, icons, posters | `threejs-image-generator` (Gemini) | Option sheets before modelling. Needs `GEMINI_API_KEY`. |
| SFX, music, voice | `threejs-audio-generator` (ElevenLabs) | Game audio files. Needs `ELEVENLABS_API_KEY`. |

Check which keys a machine has before promising an asset path; the probe
script of the `threejs-game-director` skill reports present or missing,
never values. No audio files exist under `src/` or `public/`, and audio
formats are not in the precache list (below).

## Concept art first

- A big visual change is a mockup with about three labelled options in `docs/mockups/YYYYMMDD-<topic>/` (README with the outcome, a page that opens from disk, its images). Build it from the real components, Today beside Proposed, as a `preview-*.html` harness under `BUILD_HARNESS=1` (`docs/mockups/README.md`).
- For new art, brief the artist for a hero GLB with NOTES (triangles, materials, orientation), review renders, and one self-contained local page with today beside options A/B/C, the build cost and a recommendation, under `assets/<game>/review/`.
- Look for existing concept art in `docs/` first.

## The drop drill (authored models)

Artist drops live outside the repo in `assets/<game>/` with `*-NOTES.md`. Read the notes first; versions move fast.

1. **Optimise:** `npm run glb -- '<artist file>' --flatten` (`scripts/optimize-glb.mjs`: meshopt, not Draco; defaults 4,000 triangles and 256 px textures; `--tris N --tex N --out DIR`; models under 25k triangles pass through; writes nothing if its check fails; `--selftest`).
2. **Inspect** with gltf-transform: material names, dimensions, which way is forward. Scripts must resolve the repo's packages (`createRequire` against its `package.json`).
3. **Gap hunt:** render on a white background from several angles in a scripted-camera viewer. A see-through hull shows white.
4. **Seat it:** copy the GLB into `src/games/<game>/assets/` and add its entry (for ships, `loadShipModels()` in ChessScene: key, url, fit, hover, `face: Math.PI` if the nose is -z).
5. **Shots and gates:** `npm run shots -- <shot>`, open every picture, then the usual gates.
6. **Ship** by the loop's rules (a new game stays local until the owner asks).

Conventions that hold: nose exported along +z, an `EngineGlow` emissive material, watertight textured hulls, materials named for tinting (`BunnyCoat`), origin mid-body. Dragon masks: runtime GLB in `src/shared/effects/assets/`, rig contract `DragonMaskRoot`, `DragonJaw`, `FireSocket`, `EyeAperture_L/R`; fit is judged with `MIRROR_PORTRAIT=<photo> npm run shots -- mirror-face`.

## Review renders

- A scripted-camera viewer: a standalone three.js page (import map to the repo's `three`), served locally, captured with Playwright from cameras set in code. Never frame a model by driving the in-game OrbitControls with synthetic pointer gestures: it is not reproducible, and nine iterations were lost that way.
- Both engines: the family is on iPad WebKit, which drops colour where canvas alpha is 0. Give the shot `engines: ['chromium', 'webkit']` and commit the `.webkit.png`.
- Sample colours with ffmpeg (`crop=…,scale=1:1:flags=area`), not by eye.

## Limits, measured

- **The PWA precache cap is per file:** `maximumFileSizeToCacheInBytes: 13 * 1024 * 1024` (13,631,488 B) in `vite.config.ts`. The largest file is the MediaPipe WASM at 11.2 MiB. A file over the cap is silently left out of the offline cache.
- `globPatterns` covers glb, wasm, task, webp, png, js, css, html, svg, ico and woff2. mp3, ogg, wav, m4a and json are not precached until they are added.
- **Triangle count is not the constraint.** A 300k-triangle mask is about 2.5 MB; the 1.2M master is about 8.6 MB. Measure the file before asserting a limit.
- Largest shipped GLBs: about 1.1 MB (galaxy chess pieces).

## Blender MCP

- **What:** most likely `ahujasid/blender-mcp` (MIT; PyPI `blender-mcp`), a Blender add-on that opens a local socket, plus an MCP server run with `uvx`. It is a community project, not the Blender Foundation's. Its GitHub README may now present it as "MCP for Blender" (`mcp-for-blender`), so confirm the package name on PyPI before installing.
- **Setup:**
  1. Blender: install and enable the add-on, then in the 3D view sidebar's BlenderMCP tab press Connect.
  2. Claude Code: `claude mcp add --scope local blender -- uvx blender-mcp` (local scope keeps it out of the public repo's `.mcp.json`). Restart the session; MCP servers load at start.
  3. Codex: in `.codex/config.toml` (the project must be trusted) add `[mcp_servers.blender]` with `command = "uvx"`, `args = ["blender-mcp"]`, `startup_timeout_sec = 60`.
- **Can do:** inspect the scene, create and change objects and materials, viewport screenshots, export, and run any Python in Blender. Poly Haven needs no key; Sketchfab and Hyper3D need keys.
- **Risks:** it runs arbitrary Python as the owner's user, so a crafted scene or downloaded asset can act on the machine. It needs the Blender window open, which does not suit unattended Codex runs. Only CC0 assets may reach the public repo. Set `DISABLE_TELEMETRY=true`.
- **Use it** for exploring with a human watching. Use headless scripts for anything repeatable (the default).
