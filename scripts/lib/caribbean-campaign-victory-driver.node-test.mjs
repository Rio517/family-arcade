import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { pulseRudder } from '../../src/games/caribbean/components/battle/rudderPulse.mjs';

const trace = JSON.parse(await readFile(
  new URL('../fixtures/caribbean-campaign-victory.json', import.meta.url),
  'utf8',
));

class FakeLocator {
  constructor(page, testId) {
    this.page = page;
    this.testId = testId;
  }

  async getAttribute(name) {
    if (this.testId === 'naval-elapsed' && name === 'data-battle-tick') return String(this.page.tick);
    if (this.testId === 'naval-pause' && name === 'aria-pressed') return String(this.page.paused);
    if (this.testId.startsWith('naval-rudder-') && name === 'aria-pressed') {
      const direction = this.testId.endsWith('port') ? -1 : 1;
      return String(this.page.rudder === direction);
    }
    return null;
  }

  async click() {
    this.page.clicks.push({ atTick: this.page.tick, testId: this.testId });
    if (this.testId === 'naval-pause') {
      this.page.paused = !this.page.paused;
      this.page.primed = false;
    }
  }

  async press(key) {
    assert.equal(key, 'Enter');
    assert.ok(this.testId === 'naval-rudder-port' || this.testId === 'naval-rudder-starboard');
    const direction = this.testId.endsWith('port') ? -1 : 1;
    this.page.controlActivations.push({ atMs: this.page.wallMs, key, testId: this.testId });
    pulseRudder(
      (active) => { this.page.rudder = active ? direction : 0; },
      (callback, delay) => this.page.scheduleTimer(callback, delay),
    );
  }

  async waitFor() {
    assert.equal(this.page.tick, trace.expected.atTick);
  }

  async isVisible() {
    return this.page.tick === trace.expected.atTick;
  }
}

class FakeRenderedControlPage {
  constructor({ primed = false } = {}) {
    this.tick = 0;
    this.primed = primed;
    this.cursor = 1;
    this.boundaries = trace.segments.slice(1).map(({ atTick }) => atTick).concat(trace.expected.atTick);
    this.clicks = [];
    this.keyboardEvents = [];
    this.controlActivations = [];
    this.wallMs = 0;
    this.paused = false;
    this.rudder = 0;
    this.timers = [];
    this.clock = {
      runFor: async (milliseconds) => {
        this.wallMs += milliseconds;
        const ready = this.timers.filter(({ atMs }) => atMs <= this.wallMs);
        this.timers = this.timers.filter(({ atMs }) => atMs > this.wallMs);
        for (const { callback } of ready) callback();
        if (this.paused) return;
        if (!this.primed) {
          this.primed = true;
          return;
        }
        this.tick = this.boundaries[this.cursor - 1] ?? trace.expected.atTick;
        this.cursor += 1;
      },
    };
    this.keyboard = {
      down: async (key) => { this.keyboardEvents.push({ kind: 'down', key, atMs: this.wallMs }); },
      up: async (key) => { this.keyboardEvents.push({ kind: 'up', key, atMs: this.wallMs }); },
    };
  }

  scheduleTimer(callback, delay) {
    this.timers.push({ atMs: this.wallMs + delay, callback });
    return this.timers.length;
  }

  getByTestId(testId) {
    return new FakeLocator(this, testId);
  }

  getByRole(role, options) {
    assert.equal(role, 'heading');
    assert.deepEqual(options, { name: 'Ready to board' });
    return new FakeLocator(this, 'boarding-heading');
  }

  async evaluate() {
    return structuredClone(trace.input);
  }
}

test('exports and drives the public-control trace', async () => {
  const { driveCampaignVictory } = await import('./caribbean-campaign-victory-driver.mjs');
  const page = new FakeRenderedControlPage();

  const result = await driveCampaignVictory({ page, trace, timeoutMs: 2_000 });

  assert.deepEqual(result, {
    outcome: { kind: 'boarding-ready', victorShipId: 'player' },
    atTick: 11_855,
    seedAfter: 1_310_878_278,
  });
  assert.ok(page.keyboardEvents.some(({ kind }) => kind === 'down'), 'rudder key must be held');
  assert.ok(page.keyboardEvents.some(({ kind }) => kind === 'up'), 'rudder key must be released');
  assert.ok(page.clicks.some(({ testId }) => testId === 'naval-sail-toggle'), 'sail uses rendered control');
  assert.ok(page.clicks.some(({ testId }) => testId.startsWith('naval-ammo-')), 'ammunition uses rendered control');
  assert.ok(page.clicks.some(({ testId }) => testId.startsWith('naval-fire-')), 'fire uses rendered control');
});

test('activates the rendered rudder and observes its exact public release boundary', async () => {
  const { verifyRenderedRudderRelease } = await import('./caribbean-campaign-victory-driver.mjs');
  const page = new FakeRenderedControlPage();

  await verifyRenderedRudderRelease(page);

  assert.deepEqual(page.controlActivations, [{
    atMs: 0,
    key: 'Enter',
    testId: 'naval-rudder-port',
  }]);
  assert.equal(page.wallMs, 156);
  assert.equal(page.rudder, 0);
  assert.equal(page.paused, false);
  assert.equal(page.tick, 0);
});

test('continues from a visual tick-zero prime without advancing the trace twice', async () => {
  const { driveCampaignVictory } = await import('./caribbean-campaign-victory-driver.mjs');
  const page = new FakeRenderedControlPage({ primed: true });

  const result = await driveCampaignVictory({
    page,
    trace,
    clockPrimed: true,
    timeoutMs: 2_000,
  });

  assert.deepEqual(result, trace.expected);
  assert.equal(page.wallMs, trace.segments.length * 16);
});
