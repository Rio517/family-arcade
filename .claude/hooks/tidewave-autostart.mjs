#!/usr/bin/env node
/**
 * SessionStart hook — make sure the Tidewave dev server is running.
 *
 * Tidewave IS the dev server: `.mcp.json` and `.codex/config.toml` point at
 * http://127.0.0.1:5178/tidewave/mcp, so with nothing on 5178 the MCP tools
 * are simply absent and a session quietly falls back to generic inspection.
 *
 * If 5178 is free this starts `npm run dev:tidewave` detached and reports it.
 * If something already answers, it says nothing and gets out of the way.
 * A failure to start is reported rather than swallowed — the point of the
 * hook is that nobody has to notice the absence for themselves.
 */

import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { openSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5178;
const LOG = join(tmpdir(), 'arcade-tidewave.log');
// mise's global Node is 26, which breaks parts of this toolchain; the repo
// pins 20. Prefer it when installed, fall back to whatever is on PATH.
const NODE_20_BIN = `${process.env.HOME}/.local/share/mise/installs/node/20.20.2/bin`;

function portAnswers(ms = 400) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: PORT });
    const done = (answer) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(ms);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function start(projectDir) {
  const log = openSync(LOG, 'a');
  const path = existsSync(NODE_20_BIN)
    ? `${NODE_20_BIN}:${process.env.PATH ?? ''}`
    : process.env.PATH;
  const child = spawn('npm', ['run', 'dev:tidewave'], {
    cwd: projectDir,
    env: { ...process.env, PATH: path },
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
}

async function waitForPort(attempts) {
  for (let i = 0; i < attempts; i += 1) {
    if (await portAnswers(300)) return true;
    await new Promise((r) => { setTimeout(r, 300); });
  }
  return false;
}

function emit(context) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        ...(context ? { additionalContext: context } : {}),
      },
    }),
  );
}

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (!existsSync(join(projectDir, 'package.json'))) {
  emit('');
} else if (await portAnswers()) {
  emit('');
} else {
  try {
    start(projectDir);
    const up = await waitForPort(6);
    emit(
      up
        ? `Tidewave was not running, so this hook started it: \`npm run dev:tidewave\` on http://127.0.0.1:${PORT} (log: ${LOG}). MCP servers are read at session start, so its tools are NOT available in this session — tell the user that reconnecting or restarting the session will pick them up.`
        : `Tidewave is NOT running. This hook ran \`npm run dev:tidewave\` but nothing answered on ${PORT} in time. Tell the user at the start of your first reply, and check ${LOG}. Until it is up, Tidewave MCP tools are unavailable — say so rather than working around it silently.`,
    );
  } catch (error) {
    emit(
      `Tidewave is NOT running and this hook could not start it (${error.message}). Tell the user to run \`npm run dev:tidewave\` themselves; its MCP tools are unavailable until they do.`,
    );
  }
}
