# Production naval milestone review

## Decision: revise-battle

The production-build engineering gate passes in headless Chromium: the local
hashed sloop loads with no remote dependency, physical controls and both
broadsides agree, the deterministic boarding scenario resolves through real
rules, the phone fallback remains operable, renderer resources plateau for 20
seconds after warm-up, and the measured scene remains below every technical
cap. Exact measurements and captures are in
[`metrics.json`](../../screenshots/caribbean-naval/metrics.json).

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
