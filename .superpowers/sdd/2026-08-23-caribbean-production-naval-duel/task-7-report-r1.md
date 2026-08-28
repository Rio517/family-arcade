# Task 7 Fix Round 1

Initial ordering deviated from TDD: several production fixes preceded the full
RED suite. The baseline was repaired without discarding those fixes: tests were
finished, only production paths were stashed as `task7-r1-pre-red`, and the
tests ran against clean `608eeb3` production.

Baseline RED: deferred post-gesture volley emitted no cannon cue; new surrender
while terminal emitted no surrender bell. The production stash was restored and
both regressions are green.

Implemented: effect-owned StrictMode-safe audio ownership, pending-activation
event retention, decisive surrender cue handling, one-shot node cleanup,
atomic live aim arc refresh, sensory failure boundary, shared opponent
legality gate, result fact corrections, 44px effects slider, and deterministic
camera perturbation.

Verification: focused audio/page/viewport/opponent suite passed (50 tests);
`npm run check` passed with the unchanged 67 warnings. Remaining comprehensive
matrix/mutation/browser listening evidence is root-owned follow-up work.
