# Caribbean Real-Map and Visual-Parity Direction

**Date:** 2026-08-28

**Status:** Approved direction; corrected to online-first remote vector tiles
**Branch:** `codex/caribbean-game`

## Decision

Do not draw the Caribbean by hand, bundle PMTiles, or build an offline tile
extraction pipeline.

The port, departure/sailing, and encounter views share one geographically real,
zoomable MapLibre surface. Real vector tiles load from the web at runtime. The
repository owns the nautical MapLibre style and all game overlays, so the game
controls water, land, coastlines, borders, labels, typography, routes, markers,
camera presets, and interaction without owning a tile archive.

The current `CaribbeanChart` hand-authored island silhouettes and the
`world-atlas`/`d3-geo` SVG surface are interim implementations. Although the
Natural Earth data is geographic, the 110m land-only projection is too sparse
at island scale and cannot deliver the legible, textured, zoomable chart the
approved concepts require. Neither implementation remains as a fallback: when
the network map cannot load, the game shows a clear unavailable state instead
of fake geography.

## The visual gap we are closing

### Current port/map implementation — rejected

![Current port screen with a hand-drawn chart and a large gap from the approved concept](./2026-08-28-caribbean-current-port-map-gap.png)

This review capture is the exact 3238×1564 PNG submitted for review on 2026-08-28
(`sha256 3ddac0d4c4a0438c6af250c50d9eedb9376d94db202f7511a92e9a9d9b3b60a1`).
The port framing is useful, but the chart is a diagram rather than a real map
and the whole result remains materially flatter than the concept.

### Current departure/sailing implementation — rejected

![Current sailing screen with an oversized empty sea and placeholder vector boat](./2026-08-28-caribbean-current-sailing-gap.png)

This is the exact 3780×2680 PNG submitted for review on 2026-08-28
(`sha256 89e31e1d398e42173e5d9b630a0a2c8e2f905c95808cd0d246af494ffc5b1da1`).
The sparse vector boat, single wave line, and oversized empty field are not an
acceptable approximation of the map-led experience.

### Approved targets

![Approved port concept](./2026-08-26-caribbean-port-concept.png)

![Approved encounter map concept](./2026-08-27-caribbean-encounter-map-concept-v2.png)

The implementation does not need to copy generated lettering or fabricate
locations, but it must close the material gap in information hierarchy,
geographic richness, atmosphere, and density.

## Reference architecture: KubeCon VPP

The local reference project is `kubecon-2026-vpp`, pinned during this decision
at commit `12bf316cb71194e693033e984b95cc52675dddfe`. The working path in
`presentation/src/utils/mapStyle.js` starts with a remote CARTO style
immediately, allowing MapLibre to render on first paint. Its attempted local
PMTiles path is optional, was not successful for this use, and must not be
copied.

The useful KubeCon pattern is:

1. MapLibre owns geographic projection, pan, zoom, and rendering.
2. A remote vector-tile provider supplies real geography immediately.
3. Product-owned configuration transforms that geography into the product's
   visual system.
4. Product-specific routes, markers, labels, and atmosphere remain
   application-owned layers.

The arcade uses the same online-first structure but not KubeCon's CARTO or
PMTiles provider branches. CARTO requires an API credential for the intended
managed use, so it is not the provider for this keyless family deployment.

Reference source:

- [KubeCon remote-first map style loader](https://github.com/lerenzo-enpal/kubecon-2026-vpp/blob/12bf316cb71194e693033e984b95cc52675dddfe/presentation/src/utils/mapStyle.js)

## Provider decision and validation

Use OpenFreeMap as the initial production provider:

- Vector TileJSON source: `https://tiles.openfreemap.org/planet`
- Glyph template when MapLibre symbol layers need it:
  `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`
- Data attribution: OpenFreeMap, OpenMapTiles, and OpenStreetMap contributors

Validation on 2026-08-28 confirmed that the public Liberty style returned HTTP
200 with `application/json`, `Access-Control-Allow-Origin: *`, a MapLibre style
version of 8, and an `openmaptiles` vector source backed by the endpoint above.
OpenFreeMap's quick start documents MapLibre use without an API key and says
custom styles should be hosted by the application. That is exactly this
architecture: the arcade imports its own style object and points only its
vector source and glyph template at OpenFreeMap.

Provider risk is explicit rather than hidden. OpenFreeMap is a free, as-is
service with no availability warranty and may discontinue service. Its terms
also set an 18+ eligibility requirement; because this is a family-facing app,
the terms and privacy fit must be rechecked before distribution expands beyond
the current owner-managed deployment. The UI must already tolerate provider
loss cleanly, making a later provider change a configuration replacement rather
than a component rewrite.

Provider references:

- [OpenFreeMap quick start and custom-style guidance](https://openfreemap.org/quick_start/)
- [OpenFreeMap terms of service](https://openfreemap.org/tos/)
- [OpenFreeMap privacy policy](https://openfreemap.org/privacy/)

## Runtime architecture

### Map engine and data

- Use `maplibre-gl` through `react-map-gl/maplibre`.
- Load OpenFreeMap vector tiles from the web at runtime. Do not add PMTiles,
  tile archives, extraction scripts, regional downloads, or a fallback tile
  pack.
- Keep the complete nautical MapLibre style/configuration in the repository as
  typed source. Do not load a third-party style URL at runtime.
- Reference only the approved remote vector source and glyph endpoint. Do not
  use a remote sprite sheet or geocoder; game markers are application-owned
  shapes and labels.
- Render restrained coastline, land, water, selected boundaries, and only the
  geographic labels useful to the chart. Suppress roads, businesses, POIs, and
  other modern-map clutter.
- Treat the Lesser Antilles, Barbados, Trinidad, and their approaches as the
  authored camera bounds. Tile availability outside those bounds does not make
  another location playable.

### Shared component

One `CaribbeanMap` surface serves all three contexts:

- **Port:** a restrained eastern-Caribbean overview beside the port activity;
  Bridgetown, the flagship, known leads, and the selected route are visible.
- **Departure/sailing:** the map becomes the main play surface. The ship moves
  along its real route instead of flying through an empty vector field.
- **Encounter:** the same camera and symbology frame the player and contact,
  with Pursue/Avoid decisions layered beside—not over—the map.

The map accepts content-owned geographic features and view presets. It does not
hard-code future ports or infer game rules from map data.

The three screens may compose different framing, facts, and actions around the
surface, but they must import the same renderer, style, coordinates, and marker
vocabulary. There is no port-only decorative chart and no sailing-only ocean
illustration.

### Interaction

- Pointer drag pans; wheel/pinch and visible buttons zoom; Reset returns to the
  deterministic context preset.
- Keyboard users can focus the map controls, pan with arrows, zoom with `+`/`-`,
  and reset with `Home`.
- Port may begin in a restrained camera preset, but it uses the same real map
  renderer and can be expanded/zoomed; it is not a second decorative chart.
- All camera bounds are deterministic and prevent losing the authored Caribbean
  region.
- Reduced motion disables animated route pulses and camera easing.

### Network-unavailable state

- Loading begins with a calm chart-colored skeleton that contains no invented
  coastline.
- A MapLibre source/style error or a reasonable load timeout replaces the map
  with a bordered state reading that the Caribbean chart needs a network
  connection, plus a `Retry chart` button.
- The state keeps voyage facts and non-map decisions legible. It never restores
  the hand-drawn island, the Natural Earth SVG, or a blank ocean that could be
  mistaken for loaded geography.
- Recovery retries the same provider without reloading the whole game. Browser
  online events may offer recovery but must not trigger an infinite retry loop.
- Provider errors are observable in development through Tidewave logs and
  Playwright network/console review.

### Game overlays

- Bridgetown, Mistral/current flagship, Red Jackdaw, route legs, bearing, wind,
  and voyage cost derive from existing campaign content/state.
- Unauthored locations may exist in the geographic basemap but receive no game
  marker, button, or emphasized label.
- Route and marker hit targets are application layers with explicit accessible
  names and at least 44px pointer targets where interactive.
- MapLibre attribution remains visible and readable.

## Performance and PWA boundary

- Lazy-load MapLibre with the Caribbean route so other arcade games do not pay
  its JavaScript/CSS cost.
- Map tiles and glyphs are the only intentional runtime asset downloads. Keep
  fonts used by surrounding UI, port art, ship models, routes, and markers
  bundled through Vite as before.
- Do not add remote map responses to the service-worker precache and do not
  build a runtime tile cache. The app shell and non-map experiences retain
  their existing offline behavior; real geography explicitly requires the
  network.
- Constrain zoom and bounds so sessions do not request irrelevant world tiles.
- Use MapLibre GeoJSON sources/layers for the small route and marker set. Do not
  add DeckGL unless later gameplay requires thousands of animated objects.

## Migration boundary

1. Preserve the current content-owned marker/route behavior with focused tests,
   then add failing tests for a repository-owned remote style and explicit
   unavailable state.
2. Introduce the shared MapLibre surface behind the tested marker/route
   contract.
3. Replace `components/map/CaribbeanMap.tsx`, retire the separate hand-authored
   `components/port/CaribbeanChart.tsx`, and use the shared surface in port.
4. Replace the sparse departure illustration with the same renderer,
   coordinates, and route model.
5. Remove `world-atlas`, `topojson-client`, and `d3-geo` after no production
   consumer remains. Do not replace them with PMTiles dependencies.

This migration changes presentation and map infrastructure only. It does not
change voyage outcomes, persistence, route costs, battle rules, or the existing
QWERTY battle command contract.

## Acceptance and self-review

- The repository contains the complete nautical style/configuration and no
  bundled tile archive or tile-extraction pipeline.
- Map requests go only to the approved OpenFreeMap tile/glyph hosts; no CARTO
  key, third-party style URL, sprite sheet, or geocoder is present.
- Port, departure, and encounter share the same coastline geometry and marker
  coordinates.
- A blocked or unavailable tile network produces the tested, actionable chart
  unavailable state and never fake geography.
- The current-gap screenshots above can no longer describe the implementation:
  no hand-drawn island, no placeholder sailboat, and no giant empty sea.
- Canonical desktop screenshots are compared side by side with the approved
  port and encounter concepts; compact layout is a safety adaptation, not a
  second visual design.
- Tidewave is used for source-aware player-side inspection, Playwright MCP for
  live interaction/geometry/console/network review, and the committed
  hash-aware screenshot harness for reproducible evidence.
- Screenshot files change only when bytes change and every changed image is
  inspected at original resolution before commit.
