#!/usr/bin/env node
/**
 * Prove play-together end to end against the arcade's own connection service
 * (ADR 0013), in a real browser and with nothing mocked:
 *
 *   1. Two browser contexts are two devices. Device A starts pairing in the
 *      party bar and shows a code; device B enters it; both must reach
 *      "connected" and show each other's names (the hello went through).
 *   2. Every broker request goes to familyarcade.eu/connect, and nothing goes
 *      to peerjs.com, Google or Twilio. Every RTCPeerConnection the arcade
 *      builds lists stun:familyarcade.eu:3478 as its only ICE server.
 *   3. STUN works: an RTCPeerConnection with only stun:familyarcade.eu:3478
 *      gathers a server-reflexive (srflx) candidate, i.e. the server told the
 *      browser its public address.
 *
 *   npm run build
 *   node scripts/connect-check.mjs        # serves dist on :4361 itself
 *   CONNECT_CHECK_URL=http://localhost:4361 node scripts/connect-check.mjs
 *
 * Public addresses and peer ids are never printed: socket URLs are shown
 * without their query, candidates by type only. Exits non-zero on a failure.
 * PW_CHROMIUM points at an explicit Chromium, as for `npm run shots`.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4361;
const BASE = process.env.CONNECT_CHECK_URL ?? `http://localhost:${PORT}`;
const SERVICE_HOST = 'familyarcade.eu';
const STUN_URL = 'stun:familyarcade.eu:3478';
const FORBIDDEN = /peerjs\.com|google|twilio/i;

/** One signed-in player per device: the party needs a ticket. */
const roster = (id, name) => ({ activeId: id, users: [{ id, profile: { name, points: 0, wins: 0, losses: 0 } }] });

/**
 * Runs in the page before the arcade loads: keep each RTCPeerConnection, the
 * ICE servers it was built with, and whether it ever gathered candidates.
 * Only a connection that gathers sends anything to an ICE server. PeerJS's
 * import-time feature probe (`util.supports`) builds one with the library's
 * built-in defaults and closes it without an offer, so it never gathers; the
 * check reports it apart.
 */
function instrumentWebRtc() {
  const Native = window.RTCPeerConnection;
  const seen = { entries: [], pcs: [] };
  window.__connectCheck = seen;
  window.RTCPeerConnection = class extends Native {
    constructor(config, ...rest) {
      super(config, ...rest);
      const entry = { servers: JSON.parse(JSON.stringify(config?.iceServers ?? null)), gathered: false };
      seen.entries.push(entry);
      seen.pcs.push(this);
      this.addEventListener('icegatheringstatechange', () => {
        if (this.iceGatheringState !== 'new') entry.gathered = true;
      });
    }
  };
}

/** Poll until the preview server answers, rather than sleeping a guessed amount. */
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server never came up at ${url}`);
}

const bare = (u) => {
  const url = new URL(u);
  return `${url.protocol}//${url.host}${url.pathname}`;
};
const isLocal = (u) => /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(u) || /^(data|blob|about):/.test(u);

async function device(browser, id, name, log) {
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript((state) => {
    try {
      localStorage.setItem('arcade.users.v1', JSON.stringify(state));
    } catch {
      /* storage blocked: the party will ask for a ticket and the check fails */
    }
  }, roster(id, name));
  await context.addInitScript(instrumentWebRtc);
  context.on('request', (req) => log.push({ kind: 'http', url: req.url() }));
  const page = await context.newPage();
  page.on('websocket', (ws) => log.push({ kind: 'ws', url: ws.url() }));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByTestId('party-pill').click();
  return { context, page };
}

/** The selected candidate pair of every connected RTCPeerConnection, by type. */
function selectedPairs(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const pc of window.__connectCheck.pcs) {
      if (pc.connectionState !== 'connected') continue;
      const stats = await pc.getStats();
      const byId = new Map([...stats.values()].map((s) => [s.id, s]));
      for (const s of stats.values()) {
        if (s.type !== 'candidate-pair' || !s.nominated || s.state !== 'succeeded') continue;
        const local = byId.get(s.localCandidateId);
        const remote = byId.get(s.remoteCandidateId);
        out.push(`${local?.candidateType} ↔ ${remote?.candidateType} (${local?.protocol})`);
      }
    }
    return out;
  });
}

/** Gather candidates against our STUN server only; report types, never addresses. */
function stunProbe(page, stunUrl) {
  return page.evaluate(async (urls) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls }] });
    pc.createDataChannel('probe');
    const found = [];
    const done = new Promise((resolve) => {
      pc.addEventListener('icecandidate', (e) => {
        if (!e.candidate) return resolve();
        found.push({ type: e.candidate.type, protocol: e.candidate.protocol, from: e.url ?? null });
      });
      setTimeout(resolve, 15_000);
    });
    await pc.setLocalDescription(await pc.createOffer());
    await done;
    pc.close();
    return found;
  }, stunUrl);
}

async function main() {
  let server = null;
  if (!process.env.CONNECT_CHECK_URL) {
    if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
      throw new Error('no dist/ to serve: run `npm run build` first, or set CONNECT_CHECK_URL');
    }
    server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  }
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const failures = [];
  const check = (ok, line) => {
    console.log(`${ok ? '✓' : '✗'} ${line}`);
    if (!ok) failures.push(line);
  };

  try {
    await waitForServer(BASE);
    console.log(`Arcade at ${BASE}; connection service at ${SERVICE_HOST}`);
    const log = [];
    const started = Date.now();

    const a = await device(browser, 'check-klara', 'Klara', log);
    await a.page.getByTestId('party-create').click();
    const codeEl = a.page.getByTestId('party-code');
    await codeEl.waitFor({ timeout: 20_000 });
    const code = (await codeEl.textContent())?.trim() ?? '';
    check(/^[A-Z0-9]{4}$/.test(code), `device A made a play-together code (${code.length} characters)`);

    const b = await device(browser, 'check-rio', 'Rio', log);
    await b.page.getByTestId('party-join').click();
    await b.page.getByTestId('party-code-input').fill(code);
    await b.page.getByTestId('party-join-go').click();

    const connected = async (page) => {
      try {
        await page.locator('.party-status.connected').waitFor({ timeout: 45_000 });
        return (await page.locator('.party-with').textContent())?.replace(/\s+/g, ' ').trim();
      } catch {
        return null;
      }
    };
    const [withA, withB] = await Promise.all([connected(a.page), connected(b.page)]);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    check(withA === 'Klara & Rio', `device A connected: "${withA ?? 'not connected'}"`);
    check(withB === 'Rio & Klara', `device B connected: "${withB ?? 'not connected'}" (${secs} s from the first page load)`);

    // Let the call-free party settle, then read what the browsers did.
    await a.page.waitForTimeout(1500);
    const sockets = log.filter((e) => e.kind === 'ws').map((e) => bare(e.url));
    const brokerHttp = log.filter((e) => e.kind === 'http' && new URL(e.url).hostname === SERVICE_HOST).map((e) => bare(e.url));
    const external = [...new Set(log.filter((e) => !isLocal(e.url)).map((e) => new URL(e.url).hostname))];
    const forbidden = log.filter((e) => FORBIDDEN.test(e.url)).map((e) => bare(e.url));

    check(
      sockets.length > 0 && sockets.every((u) => u === `wss://${SERVICE_HOST}/connect/peerjs`),
      `broker sockets: ${sockets.length ? [...new Set(sockets)].join(', ') : 'none'} (${sockets.length} opened)`,
    );
    check(
      brokerHttp.every((u) => u.startsWith(`https://${SERVICE_HOST}/connect/`)),
      `broker HTTP: ${brokerHttp.length ? [...new Set(brokerHttp)].join(', ') : 'none'}`,
    );
    check(external.length === 1 && external[0] === SERVICE_HOST, `hosts outside localhost: ${external.join(', ') || 'none'}`);
    check(forbidden.length === 0, `requests to peerjs.com, Google or Twilio: ${forbidden.length ? forbidden.join(', ') : 'none'} (of ${log.length} seen)`);

    const entries = [
      ...(await a.page.evaluate(() => window.__connectCheck.entries)),
      ...(await b.page.evaluate(() => window.__connectCheck.entries)),
    ];
    const onlyOurs = (servers) => JSON.stringify(servers) === JSON.stringify([{ urls: STUN_URL }]);
    const gathered = entries.filter((e) => e.gathered);
    const idle = entries.filter((e) => !e.gathered);
    const listed = (list) => [...new Set(list.map((e) => JSON.stringify(e.servers)))].join(' | ') || 'none';
    check(
      gathered.length > 0 && gathered.every((e) => onlyOurs(e.servers)),
      `ICE servers on all ${gathered.length} RTCPeerConnections that gathered candidates: ${listed(gathered)}`,
    );
    console.log(
      `  (${idle.length} never gathered, so sent nothing: PeerJS's feature probe at import and any unused connection; built with ${listed(idle)})`,
    );
    const pairs = [...(await selectedPairs(a.page)), ...(await selectedPairs(b.page))];
    check(
      pairs.length > 0 && pairs.every((p) => !p.includes('relay')),
      `game data path (selected candidate pairs): ${pairs.join(', ') || 'none'} (direct, no relay)`,
    );

    const found = await stunProbe(a.page, STUN_URL);
    const srflx = found.filter((c) => c.type === 'srflx');
    check(
      srflx.length > 0,
      `STUN: ${srflx.length} srflx candidate(s) from ${[...new Set(srflx.map((c) => `${c.from ?? STUN_URL} over ${c.protocol}`))].join(', ') || STUN_URL}; all gathered: ${found.map((c) => c.type).join(', ') || 'none'}`,
    );

    await a.context.close();
    await b.context.close();
  } finally {
    await browser.close();
    server?.kill();
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
