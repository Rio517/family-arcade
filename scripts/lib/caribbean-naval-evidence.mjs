const DRAW_CALL_CAP = 120;
const TRIANGLE_CAP = 100_000;
const SUSTAINED_FPS_FLOOR = 50;

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function addRecordedFailures(issues, label, failures) {
  if (hasItems(failures)) issues.push(`${label}: ${failures.length}`);
}

export function evaluateNavalEvidence(evidence) {
  const issues = [];

  addRecordedFailures(issues, 'console errors', evidence.consoleErrors);
  addRecordedFailures(issues, 'page errors', evidence.pageErrors);
  addRecordedFailures(issues, 'request failures', evidence.requestFailures);
  addRecordedFailures(issues, 'unhandled rejections', evidence.unhandledRejections);

  const asset = evidence.asset ?? {};
  const requestedPaths = asset.requestedPaths ?? [];
  if (!asset.expectedPath || !requestedPaths.includes(asset.expectedPath)) {
    issues.push('exact local hashed GLB was not requested');
  }
  if (hasItems(asset.remoteDependencies)) issues.push('remote dependencies were requested');

  const performance = evidence.performance ?? {};
  if (!Number.isFinite(performance.maxDrawCalls) || performance.maxDrawCalls < 0 || performance.maxDrawCalls > DRAW_CALL_CAP) {
    issues.push(`draw calls exceed ${DRAW_CALL_CAP}`);
  }
  if (!Number.isFinite(performance.maxTriangles) || performance.maxTriangles < 0 || performance.maxTriangles > TRIANGLE_CAP) {
    issues.push(`triangles exceed ${TRIANGLE_CAP}`);
  }
  if (!Number.isFinite(performance.sustainedFps) || performance.sustainedFps < SUSTAINED_FPS_FLOOR) {
    issues.push(`sustained FPS below ${SUSTAINED_FPS_FLOOR}`);
  }

  const resources = evidence.resources ?? {};
  const growth = resources.growthAfterWarmup ?? {};
  for (const name of ['textures', 'geometries', 'materials', 'activeEffects', 'effectCapacity']) {
    if (!Number.isFinite(growth[name]) || growth[name] < 0 || growth[name] > 0) {
      issues.push(`${name} grew after warm-up`);
    }
  }
  addRecordedFailures(issues, 'allocation errors', resources.allocationErrors);
  addRecordedFailures(issues, 'capacity errors', resources.capacityErrors);
  addRecordedFailures(issues, 'pool errors', resources.poolErrors);

  const handedness = evidence.handedness ?? {};
  if (!Number.isFinite(handedness.portVectorX) || Math.abs(handedness.portVectorX - 1) > 1e-9) issues.push('port vector is not +X');
  if (!Number.isFinite(handedness.starboardVectorX) || Math.abs(handedness.starboardVectorX + 1) > 1e-9) issues.push('starboard vector is not -X');
  if (!Number.isFinite(handedness.portMuzzleOriginX) || !(handedness.portMuzzleOriginX > 0)) issues.push('port muzzle is not on +X');
  if (!Number.isFinite(handedness.starboardMuzzleOriginX) || !(handedness.starboardMuzzleOriginX < 0)) issues.push('starboard muzzle is not on -X');
  if (!Number.isFinite(handedness.steeringPortHeadingDelta) || !(handedness.steeringPortHeadingDelta > 0)) issues.push('A did not turn physically to port');
  if (!Number.isFinite(handedness.steeringStarboardHeadingDelta) || !(handedness.steeringStarboardHeadingDelta < 0)) issues.push('D did not turn physically to starboard');
  if (handedness.staleRudder !== false) issues.push('rudder remained active after release');

  if (evidence.scenario?.ok !== true) issues.push('deterministic scenario failed');
  if (evidence.scenario?.outcome !== 'boarding-ready') issues.push('boarding-ready outcome not reached');
  if (evidence.fallback?.ok !== true) issues.push('WebGL fallback controls failed');

  return { ok: issues.length === 0, issues };
}
