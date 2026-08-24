import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
    return null;
  }

  async click() {
    this.page.clicks.push({ atTick: this.page.tick, testId: this.testId });
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
    this.wallMs = 0;
    this.clock = {
      runFor: async (milliseconds) => {
        this.wallMs += milliseconds;
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
  const {
    driveCampaignVictory,
    RUDDER_RELEASE_MS,
  } = await import('./caribbean-campaign-victory-driver.mjs');
  const page = new FakeRenderedControlPage();

  const result = await driveCampaignVictory({ page, trace, timeoutMs: 2_000 });

  assert.equal(RUDDER_RELEASE_MS, 140);
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
