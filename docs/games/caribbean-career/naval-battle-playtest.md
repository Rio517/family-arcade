# Production naval duel playtest and device gate

## Evidence boundary

The automated production-build browser gate is recorded separately in
[`metrics.json`](../../screenshots/caribbean-naval/metrics.json). It proves the
technical journey; it is not a human play session and it is not target-iPad
evidence. No human or target-iPad session was available for this milestone, so
every row below remains `not yet observed`.

## Anonymous human sessions

| Session | Device | Prior sailing-game experience | Useful broadside time | Completed-battle duration | Outcome explanation | Immediate rematch | Confusion | Assists used | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anonymous A | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed |
| Anonymous B | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed |
| Anonymous C | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed | not yet observed |

Human pass thresholds are exact:

- at least 2 of 3 players fire a useful broadside within 60 seconds without instruction;
- all 3 of 3 correctly explain the decisive outcome fact;
- median completed-battle duration is 2–4 minutes; and
- at least 2 of 3 choose an immediate rematch.

No human threshold can be evaluated until the three sessions are observed.

## Target-iPad checklist

| Check | Required evidence / threshold | Observation | Status |
| --- | --- | --- | --- |
| Cold load | Record first uncached launch and any failure; no milestone time cap was approved | not yet observed | not yet observed |
| Warm load | Record repeat launch and any failure; no milestone time cap was approved | not yet observed | not yet observed |
| Ten-minute thermal session | Complete ten continuous battle minutes without crash, context loss, or visible thermal collapse | not yet observed | not yet observed |
| Rotation, background, resume | Landscape/portrait rotation and background/resume retain a usable battle with no stale input | not yet observed | not yet observed |
| Touch Q / E / A / D | All four physical-side actions work through 44×44 CSS-pixel touch targets | not yet observed | not yet observed |
| Reduced motion | Shake, bob, rapid particles, and dramatic camera motion are suppressed without changing simulation | not yet observed | not yet observed |
| Airplane-mode reload | After a prior complete install, reload succeeds with zero remote runtime dependencies | not yet observed | not yet observed |
| Sustained FPS | At least 50 FPS sustained | not yet observed | not yet observed |
| Maximum draw calls | At most 120 in every active naval scene | not yet observed | not yet observed |
| Maximum visible triangles | At most 100,000 in every active naval scene | not yet observed | not yet observed |
| Safari / WebGL errors | Zero console errors, page errors, request failures, unhandled rejections, and WebGL construction/render errors | not yet observed | not yet observed |

The target-iPad gate is incomplete. Headless Chromium measurements must not be
copied into these rows.
