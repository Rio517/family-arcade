# Caribbean Real Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Caribbean campaign's hand-drawn and placeholder geography with one polished, real-coordinate MapLibre chart used by port, sailing, and encounter screens, with an honest network-unavailable state.

**Architecture:** A repository-owned typed MapLibre style points only at OpenFreeMap's runtime vector TileJSON source. A shared `CaribbeanMap` owns the map lifecycle, route/contact overlays, authored labels and brass chart controls; small context presets adapt its camera and presentation for port, sailing, and encounter without creating separate map implementations. The deterministic browser harness permits only the named tile provider, waits for map readiness, and separately verifies provider failure behavior.

**Tech Stack:** React 18.3.1, TypeScript, MapLibre GL JS 5.20.1, react-map-gl 8.1.0, Vitest/Testing Library, Playwright, Tidewave, CSS.

**Spec:** `docs/designs/2026-08-28-caribbean-real-map-direction.md`

## Global Constraints

- Use Node 20 from `.nvmrc`; on this machine prefix commands with `PATH=/Users/marioflores/.local/share/mise/installs/node/20/bin:$PATH`.
- Reuse the existing application server at `http://127.0.0.1:5178`; do not start another Vite server and do not disturb port 5173.
- Use Tidewave first for source-aware inspection and the connected `main-chrome` session for live UI review; use Playwright MCP for deterministic viewport and browser-state review.
- Fetch real vector map data from `https://tiles.openfreemap.org/planet` at runtime. Do not add PMTiles, downloaded tile archives, an extraction pipeline, a remote style URL, remote sprites, or fake geography.
- Keep map colors, layers, typography, borders, routes, markers, controls, loading, and failure presentation in this repository.
- Use one shared map surface and one coordinate dataset across port, sailing, and encounter screens.
- Preserve `docs/designs/2026-08-28-caribbean-current-port-map-gap.png`, `docs/designs/2026-08-28-caribbean-current-sailing-gap.png`, and all approved concept references byte-for-byte.
- Keep screenshot writes content-addressed: do not replace a committed screenshot if its bytes are identical.

---

### Task 1: Repository-owned nautical style and coordinate model

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/games/caribbean/components/map/caribbeanMapStyle.ts`
- Create: `src/games/caribbean/components/map/caribbeanMapStyle.test.ts`
- Create: `src/games/caribbean/components/map/caribbeanMapData.ts`
- Create: `src/games/caribbean/components/map/caribbeanMapData.test.ts`

**Interfaces:**
- Produces: `OPEN_FREE_MAP_TILEJSON_URL`, `CARIBBEAN_MAP_STYLE: StyleSpecification`, `CARIBBEAN_MAP_POINTS`, `CARIBBEAN_ROUTE`, `CARIBBEAN_MAP_PRESETS`, and `CaribbeanMapContext = "port" | "sailing" | "encounter"`.
- Guarantees: the style has one remote vector source, no PMTiles, no remote style, no sprites, and no invented polygon geography.

- [ ] **Step 1: Add failing style-contract tests**

```ts
expect(CARIBBEAN_MAP_STYLE.version).toBe(8)
expect(CARIBBEAN_MAP_STYLE.sources).toEqual({
  openmaptiles: { type: "vector", url: OPEN_FREE_MAP_TILEJSON_URL },
})
expect(CARIBBEAN_MAP_STYLE).not.toHaveProperty("sprite")
expect(JSON.stringify(CARIBBEAN_MAP_STYLE)).not.toMatch(/pmtiles|\.pmtiles/i)
expect(CARIBBEAN_MAP_STYLE.layers).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ id: "caribbean-water", "source-layer": "water" }),
    expect.objectContaining({ id: "caribbean-boundaries", "source-layer": "boundary" }),
  ]),
)
```

- [ ] **Step 2: Run the focused tests and confirm the missing modules fail**

Run: `npx vitest run src/games/caribbean/components/map/caribbeanMapStyle.test.ts src/games/caribbean/components/map/caribbeanMapData.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Install MapLibre dependencies and implement the minimal typed style/data modules**

Use `maplibre-gl@5.20.1` and `react-map-gl@8.1.0`. Define real longitude/latitude tuples for Bridgetown, Saint Lucia, Martinique, Dominica, Guadeloupe, Trinidad, the player's sailing position, and the Red Jackdaw contact. Build the route as GeoJSON `LineString` data and keep camera presets separate from visual styling.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run the command from Step 2. Expected: PASS.

### Task 2: Shared MapLibre lifecycle and nautical chart UI

**Files:**
- Rewrite: `src/games/caribbean/components/map/CaribbeanMap.tsx`
- Rewrite: `src/games/caribbean/components/map/CaribbeanMap.test.tsx`
- Create: `src/games/caribbean/styles/map.css`
- Modify: `src/games/caribbean/styles/caribbean.css`
- Delete: `src/games/caribbean/components/map/mapView.ts`

**Interfaces:**
- Consumes: Task 1 style, points, route, and presets.
- Produces: `CaribbeanMap({ context, playerName, contactVisible, statusLabel? })` and DOM state `data-map-phase="loading|ready|unavailable"`.
- Produces: a `Retry chart` action that remounts the map and repeats the online load.

- [ ] **Step 1: Replace the legacy SVG tests with failing shared-map behavior tests**

Mock only `react-map-gl/maplibre`'s WebGL boundary. Assert that the component receives `CARIBBEAN_MAP_STYLE`, the context camera, and repository-owned route/marker overlays. Trigger `onLoad` and assert `data-map-phase="ready"`; trigger an initial `onError` and assert the exact unavailable copy and retry button.

```tsx
expect(screen.getByRole("region", { name: /caribbean nautical chart/i }))
  .toHaveAttribute("data-map-context", "encounter")
fireEvent.error(screen.getByTestId("maplibre-map"))
expect(screen.getByText("Caribbean chart needs a network connection.")).toBeVisible()
await user.click(screen.getByRole("button", { name: "Retry chart" }))
expect(mapMountCount).toBe(2)
```

- [ ] **Step 2: Run the component test and verify the legacy SVG implementation fails the new contract**

Run: `npx vitest run src/games/caribbean/components/map/CaribbeanMap.test.tsx`

Expected: FAIL because there is no MapLibre surface or lifecycle state.

- [ ] **Step 3: Implement the shared map and brass chart shell**

Import `maplibre-gl/dist/maplibre-gl.css` once. Render the map with repository-owned style data, visible attribution, constrained Caribbean bounds, reduced-motion-aware transitions, route and marker layers at real coordinates, 44px zoom/reset controls, a loading cover, and a no-geography unavailable cover. Treat errors before the first successful `load` as unavailable; once ready, preserve the rendered chart during recoverable individual tile errors.

- [ ] **Step 4: Make the component tests pass**

Run the command from Step 2. Expected: PASS.

### Task 3: Port, sailing, and encounter integration

**Files:**
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.test.tsx`
- Delete: `src/games/caribbean/components/port/CaribbeanChart.tsx`
- Delete: `src/games/caribbean/components/port/CaribbeanChart.test.tsx`
- Modify: `src/games/caribbean/components/voyage/SailingPage.tsx`
- Modify: `src/games/caribbean/components/voyage/SailingPage.test.tsx`
- Delete: `src/games/caribbean/components/voyage/VoyageInstrument.tsx`
- Delete: `src/games/caribbean/components/voyage/VoyageInstrument.test.tsx`
- Modify: `src/games/caribbean/components/voyage/EncounterPage.tsx`
- Modify: `src/games/caribbean/components/voyage/EncounterPage.test.tsx`
- Modify: `src/games/caribbean/styles/port.css`
- Modify: `src/games/caribbean/styles/voyage.css`

**Interfaces:**
- Consumes: `CaribbeanMap` from Task 2.
- Guarantees: all three screens render that component with the matching context; port supplies the lead/status, sailing supplies route state, and encounter controls contact visibility.

- [ ] **Step 1: Add failing screen-level tests**

Mock `CaribbeanMap` at the screen boundary and assert calls with `context="port"`, `context="sailing"`, and `context="encounter"`. Assert legacy `CaribbeanChart` and `VoyageInstrument` landmarks are absent.

- [ ] **Step 2: Run the three screen tests and verify port/sailing fail**

Run: `npx vitest run src/games/caribbean/components/port/PortPage.test.tsx src/games/caribbean/components/voyage/SailingPage.test.tsx src/games/caribbean/components/voyage/EncounterPage.test.tsx`

Expected: FAIL for the port and sailing shared-map expectations.

- [ ] **Step 3: Integrate the shared map and reshape the layouts to the approved concepts**

Replace the port's small fake chart with a tall brass-framed navigation chart in the right rail. Replace sailing's empty-water/instrument placeholder with the same chart as the dominant voyage surface while retaining the decision card. Keep encounter's parchment chart dominant on the left and its command rail on the right. Remove only CSS owned by the deleted placeholders; retain established typography, paper, brass, and responsive tokens.

- [ ] **Step 4: Run the screen and responsive tests**

Run the command from Step 2, then `npx vitest run src/games/caribbean/styles/voyageResponsive.test.tsx src/games/caribbean/styles/battleResponsive.test.tsx`.

Expected: PASS.

### Task 4: Provider-aware screenshot and failure validation

**Files:**
- Create: `scripts/lib/caribbean-map-network.mjs`
- Create: `scripts/lib/caribbean-map-network.test.mjs`
- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `classifyCaribbeanMapRequest(url, localOrigin)` returning `"local" | "openfreemap" | "unexpected-external"`.
- Guarantees: screenshots wait for `[data-map-phase="ready"]`; OpenFreeMap is the only permitted external origin; a provider-aborted page must show `[data-map-phase="unavailable"]` and `Retry chart` without any fake coastline.

- [ ] **Step 1: Add failing pure request-classification tests**

```js
assert.equal(classifyCaribbeanMapRequest("http://127.0.0.1:5178/src/main.tsx", origin), "local")
assert.equal(classifyCaribbeanMapRequest("https://tiles.openfreemap.org/planet", origin), "openfreemap")
assert.equal(classifyCaribbeanMapRequest("https://example.com/map", origin), "unexpected-external")
```

- [ ] **Step 2: Run the network helper test and verify it fails**

Run: `node --test scripts/lib/caribbean-map-network.test.mjs`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement classification and update the browser harness**

Record OpenFreeMap requests separately from unexpected external requests. Require at least one provider request on real-map screens. Before each screenshot, wait for map readiness. Add a provider-failure pass that aborts `https://tiles.openfreemap.org/**`, waits for unavailable state, verifies the retry control, and writes through the existing `saveIfChanged` hash gate.

- [ ] **Step 4: Run helper tests and the screenshot harness against port 5178**

Run: `node --test scripts/lib/caribbean-map-network.test.mjs`.

Run: `npm run caribbean:port-check -- --base-url http://127.0.0.1:5178`.

Expected: helper PASS; all required viewport assertions PASS; no unexpected external requests; unchanged screenshot bytes are not rewritten.

### Task 5: Dependency cleanup, visual iteration, and release verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: any focused test/CSS file identified by actual Tidewave or Playwright evidence

**Interfaces:**
- Removes: `d3-geo`, `topojson-client`, `world-atlas`, and their type packages if `rg` confirms no remaining consumers.
- Produces: a verified branch with source, screenshots, docs, and runtime behavior aligned.

- [ ] **Step 1: Use Tidewave in `main-chrome` for source-aware review of port, sailing, encounter, and network failure states**

Inspect the actual DOM, computed layout, console, and network on `http://127.0.0.1:5178/preview-caribbean-game.html`. Fix visible generic-widget styling, clipped labels, unreadable contrast, route/marker ambiguity, or missing failure-state hierarchy.

- [ ] **Step 2: Use Playwright MCP at every required viewport**

Review desktop `1440x900`, tablet `1180x820`, compact `1024x768`, minimum supported `960x600`, and the existing portrait unsupported case. Exercise port, departure/sailing, encounter, map controls, retry, keyboard focus, and reduced motion.

- [ ] **Step 3: Remove confirmed-unused legacy map dependencies and run focused tests**

Use `rg` before uninstalling. Run all map, port, sailing, encounter, responsive, and screenshot-helper tests with Node 20. Expected: PASS.

- [ ] **Step 4: Run full verification from fresh command invocations**

Run: `npm run check`.

Run: `npx vitest run`.

Run: delete only the repository's explicit TypeScript build-info outputs after locating them, then `npm run build` to force TypeScript and Vite verification.

Run: the full Caribbean screenshot/hash validation against port 5178.

Expected: every command exits 0; the browser console has no unexpected errors; only OpenFreeMap is contacted externally; documentation screenshot hashes remain unchanged.

- [ ] **Step 5: Request an independent code review and address only evidence-backed findings**

Ask the reviewer to check the full diff against the authoritative design doc, with special attention to runtime network behavior, MapLibre cleanup, accessibility, three-screen reuse, responsive layout, and screenshot determinism. Re-run affected verification after fixes.

- [ ] **Step 6: Commit and push the existing branch**

```bash
git add package.json package-lock.json src/games/caribbean scripts docs/plans/2026-08-28-caribbean-real-map.md
git commit -m "feat: add shared Caribbean nautical map"
git push origin codex/caribbean-game
```
