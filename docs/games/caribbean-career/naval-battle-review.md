# Production naval milestone review

## Decision: revise-battle

The revised production-build engineering gate passes in headless Chromium: the
local hashed sloop loads with no remote dependency, physical controls and both
broadsides agree, the deterministic boarding scenario resolves through real
rules, the supported-screen fallback remains operable, renderer resources—including
live GPU buffer attributes—plateau for 20 seconds after warm-up, and the measured scene remains below
every technical cap. The 1440×900, 1180×820, 1024×768, and exact 960×600
captures prove an edge-to-edge stage, clear engagement centre, contained
44 px controls, a 14 px action-copy floor, readable health/reloads, and no outer
scroll. Decision and briefing evidence keeps the full shortcut legend and
primary action above the fold. The 430×932 and
844×390 captures contain only the minimum-screen notice; live resize stops the
old simulation and returns through a fresh session. Exact measurements and
captures are in
[`metrics.json`](../../screenshots/caribbean-naval/metrics.json).

Ordinary evidence pages use the browser's `no-preference` motion setting. The
real scene recorded 118 intermediate ship frames and 59 intermediate camera
frames in that path. A separate `reduce` page recorded 14 live ship snaps and
7 camera snaps. The active plateau sustained a 69 FPS minimum three-sample
average with 33 maximum draw calls, 7,841 maximum triangles, and zero texture,
geometry, material, buffer-attribute, or effect-capacity growth.

The action-copy measurement includes the separate pause action as well as the
bottom strip. Its visible `Space / Esc` shortcut and the other measured action
text compute to at least 14 px at exact 960×600 and 1024×768.

The recorded 2026-08-23 experienced-owner feedback drove this revision: remove
the giant side fire controls, restore the POC's sea-first composition, simplify
the overlay, preserve the clearer health display, keep shortcuts visible, and
remove visible ship stepping. This owner record is intentionally separate from
the three anonymous first-time sessions and does not satisfy their thresholds.

The milestone decision remains `revise-battle` because all three anonymous
human sessions and the target-iPad checklist are still `not yet observed`.
Automation cannot establish two-to-four-minute battle feel, first-time
comprehension, immediate-rematch intent, iPad Safari behaviour, touch quality,
or ten-minute thermal stability.

This incomplete external evidence does not block continued isolated
implementation of the Bridgetown port and career loop. It does not label naval
combat production-ready, authorize a merge, or authorize a push. The branch
remains local and isolated until the owner supplies or approves the missing human
and target-device evidence and later makes an explicit integration decision.
