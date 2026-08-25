const CURRENT_SAVE_KEY = 'caribbean:campaign:current';
const EXACT_INPUT = { battleId: 'voyage-5-battle', seed: 1_971_161_494 };
const EXACT_EXPECTED = {
  outcome: { kind: 'boarding-ready', victorShipId: 'player' },
  atTick: 11_855,
  seedAfter: 1_310_878_278,
};
const RUDDER_KEYS = { '-1': 'a', 1: 'd' };

function invariant(condition, message) {
  if (!condition) throw new Error(`Campaign victory driver: ${message}`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateTrace(trace) {
  invariant(trace && typeof trace === 'object', 'missing trace');
  invariant(sameJson(trace.input, EXACT_INPUT), 'unexpected saved-input fixture');
  invariant(trace.cadenceTicks === 6, 'cadence must be six ticks');
  invariant(sameJson(trace.expected, EXACT_EXPECTED), 'unexpected terminal fixture');
  invariant(Array.isArray(trace.segments) && trace.segments.length > 0, 'missing command rows');

  let expectedTick = 0;
  for (const [index, row] of trace.segments.entries()) {
    invariant(row && typeof row === 'object', `row ${index} is not an object`);
    invariant(row.atTick === expectedTick, `row ${index} skipped six-tick boundary ${expectedTick}`);
    invariant(row.atTick < trace.expected.atTick, `row ${index} is not before terminal tick`);
    invariant(row.rudder === -1 || row.rudder === 0 || row.rudder === 1, `row ${index} rudder is not public-control representable`);
    invariant(row.sail === 'full' || row.sail === 'reefed', `row ${index} sail is not public-control representable`);
    invariant(row.ammunition === 'round' || row.ammunition === 'chain' || row.ammunition === 'grape', `row ${index} ammunition is not public-control representable`);
    invariant(row.fire === null || row.fire === 'port' || row.fire === 'starboard', `row ${index} fire is not public-control representable`);
    expectedTick += trace.cadenceTicks;
  }
  invariant(trace.segments.at(-1).atTick === 11_850, 'last command row must begin at tick 11850');
}

async function readSavedInput(page) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    try {
      const envelope = JSON.parse(raw);
      const input = envelope?.payload?.state?.mode?.input;
      return input && typeof input === 'object'
        ? { battleId: input.battleId, seed: input.seed }
        : null;
    } catch {
      return null;
    }
  }, CURRENT_SAVE_KEY);
}

async function readTick(page) {
  const raw = await page.getByTestId('naval-elapsed').getAttribute('data-battle-tick');
  invariant(typeof raw === 'string' && /^\d+$/.test(raw), 'public HUD tick is missing or malformed');
  const tick = Number(raw);
  invariant(Number.isSafeInteger(tick), 'public HUD tick is not a safe integer');
  return tick;
}

async function resultVisible(page) {
  try {
    return await page.getByTestId('naval-result-action').isVisible();
  } catch {
    return false;
  }
}

export async function verifyRenderedRudderRelease(page) {
  invariant(page && typeof page === 'object', 'missing rendered page adapter');
  const pause = page.getByTestId('naval-pause');
  const rudder = page.getByTestId('naval-rudder-port');
  const beforeTick = await readTick(page);
  invariant(await pause.getAttribute('aria-pressed') === 'false', 'rudder probe requires an active battle');

  await pause.click();
  invariant(await pause.getAttribute('aria-pressed') === 'true', 'rudder probe did not pause through the rendered control');
  await rudder.press('Enter');
  invariant(await rudder.getAttribute('aria-pressed') === 'true', 'rendered rudder did not engage');

  await page.clock.runFor(139);
  invariant(await rudder.getAttribute('aria-pressed') === 'true', 'rendered rudder released before 140ms');
  invariant(await readTick(page) === beforeTick, 'rudder probe advanced the paused battle');
  await page.clock.runFor(1);
  invariant(await rudder.getAttribute('aria-pressed') === 'false', 'rendered rudder did not release at 140ms');
  invariant(await readTick(page) === beforeTick, 'rudder release advanced the paused battle');

  await pause.click();
  invariant(await pause.getAttribute('aria-pressed') === 'false', 'rudder probe did not resume through the rendered control');
  await page.clock.runFor(16);
  invariant(await readTick(page) === beforeTick, 'rudder probe resume consumed paused wall time');
}

async function drive(page, trace, clockPrimed) {
  const mountedInput = await readSavedInput(page);
  invariant(sameJson(mountedInput, trace.input), 'mounted saved input does not match trace');
  invariant(await readTick(page) === 0, 'battle did not mount at tick zero');

  if (!clockPrimed) {
    await page.clock.runFor(16);
    invariant(await readTick(page) === 0, 'first RAF must prime without advancing a tick');
  }

  const current = { rudder: 0, sail: 'full', ammunition: 'round' };
  let heldRudderKey = null;

  const setRudder = async (rudder) => {
    const nextKey = rudder === 0 ? null : RUDDER_KEYS[String(rudder)];
    if (heldRudderKey === nextKey) return;
    if (heldRudderKey !== null) await page.keyboard.up(heldRudderKey);
    heldRudderKey = nextKey;
    if (heldRudderKey !== null) await page.keyboard.down(heldRudderKey);
    current.rudder = rudder;
  };

  try {
    for (const [index, row] of trace.segments.entries()) {
      const observed = await readTick(page);
      invariant(observed === row.atTick, `row ${index} expected tick ${row.atTick}, observed ${observed}`);

      await setRudder(row.rudder);
      if (current.sail !== row.sail) {
        await page.getByTestId('naval-sail-toggle').click();
        current.sail = row.sail;
      }
      if (current.ammunition !== row.ammunition) {
        await page.getByTestId(`naval-ammo-${row.ammunition}`).click();
        current.ammunition = row.ammunition;
      }
      if (row.fire !== null) await page.getByTestId(`naval-fire-${row.fire}`).click();

      const targetTick = trace.segments[index + 1]?.atTick ?? trace.expected.atTick;
      let tick = observed;
      while (tick !== targetTick) {
        const before = tick;
        await page.clock.runFor(16);
        tick = await readTick(page);
        invariant(tick >= before, `tick moved backward from ${before} to ${tick}`);
        invariant(tick <= targetTick, `tick skipped target ${targetTick} and reached ${tick}`);
        if (await resultVisible(page)) {
          invariant(tick === trace.expected.atTick && targetTick === trace.expected.atTick, `battle ended early at tick ${tick}`);
        }
      }
    }
  } finally {
    if (heldRudderKey !== null) await page.keyboard.up(heldRudderKey);
  }

  invariant(await readTick(page) === trace.expected.atTick, 'terminal HUD tick drifted');
  await page.getByTestId('naval-result-action').waitFor();
  await page.getByRole('heading', { name: 'Ready to board' }).waitFor();
  return structuredClone(trace.expected);
}

export async function driveCampaignVictory({ page, trace, clockPrimed = false, timeoutMs = 330_000 }) {
  validateTrace(trace);
  invariant(page && typeof page === 'object', 'missing rendered page adapter');
  invariant(typeof clockPrimed === 'boolean', 'clockPrimed must be boolean');
  invariant(Number.isFinite(timeoutMs) && timeoutMs > 0, 'timeout must be positive');

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Campaign victory driver: timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([drive(page, trace, clockPrimed), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
