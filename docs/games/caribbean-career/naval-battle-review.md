# Production naval milestone review

## Decision: revise-battle

The revised production-build engineering gate passes in headless Chromium: the
local hashed sloop loads with no remote dependency, physical controls and both
broadsides agree, the deterministic boarding scenario resolves through real
rules, the supported-screen fallback remains operable, renderer resources
plateau for 20 seconds after warm-up, and the measured scene remains below
every technical cap. The 1440×900, 1180×820, 1024×768, and exact 960×600
captures prove an edge-to-edge stage, clear engagement centre, contained
shortcut labels, readable health/reloads, and no outer scroll. The 430×932 and
844×390 captures contain only the minimum-screen notice; live resize stops the
old simulation and returns through a fresh session. Exact measurements and
captures are in
[`metrics.json`](../../screenshots/caribbean-naval/metrics.json).

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
remains local and isolated until Mario supplies or approves the missing human
and target-device evidence and later makes an explicit integration decision.
