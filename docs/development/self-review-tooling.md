# Runtime and Visual Self-Review Tooling

This repository uses three complementary review layers. None replaces the
others.

## 1. Tidewave: source-aware live-app inspection

Tidewave is installed through the Vite plugin and exposed only by the dedicated
development command:

```sh
npm run dev:tidewave
```

The command is pinned to `127.0.0.1:5178` with `--strictPort`. Both client
configurations use the same endpoint:

- `.codex/config.toml` for Codex desktop, CLI, and the IDE extension;
- `.mcp.json` for Claude-compatible clients.

```text
http://127.0.0.1:5178/tidewave/mcp
```

Start the server before restarting the coding-agent session. MCP connections
are discovered at session startup; changing either configuration does not add
Tidewave to an already-running session. Codex must trust the project before it
will load the project-scoped `.codex/config.toml`.

For a Codex installation that does not inherit trust into a linked worktree,
register the same endpoint once at machine level with the supported CLI:

```sh
codex mcp add tidewave --url http://127.0.0.1:5178/tidewave/mcp
codex mcp get tidewave
```

The machine-level registration and the tracked project configuration use the
same name and URL, so the project layer remains a portable declaration rather
than a conflicting second server.

Use Tidewave to relate a visible element or failed interaction to the source
that owns it, inspect the live application, and exercise real pointer and
keyboard behavior. It is development-only and must never appear in `dist/`.

## 2. Playwright MCP: interactive visual review

The Playwright MCP is the immediate review surface for:

- navigating the real running app;
- resizing to the supported viewport boundaries;
- clicking, dragging, typing, and using keyboard shortcuts;
- inspecting DOM geometry, computed styles, focus, console output, and network
  requests; and
- taking review screenshots for direct comparison with approved concepts.

An MCP review is exploratory evidence, not a committed regression test.

## 3. Committed Playwright/Vitest evidence

Player-visible changes require reproducible repository-owned evidence:

- `npm run shots` for the general arcade screenshot set;
- `npm run caribbean:port-check` for port, voyage, and campaign screenshots;
- `npm run caribbean:naval-check` for naval evidence; and
- focused Vitest/Testing Library tests for component and interaction contracts.

The screenshot writers compare bytes or hashes and leave identical tracked
images untouched. Changed screenshots are inspected at original resolution and
committed with the source change.

## Recommended review loop

1. Run `npm run dev:tidewave`.
2. Restart/reconnect the coding-agent session so Tidewave is discovered.
3. Use Tidewave and Playwright MCP to inspect the player experience and isolate
   source ownership.
4. Add or update focused automated tests for every discovered defect.
5. Run the repository screenshot harness and inspect only hash-changed images.
6. Finish with `npm run check`, `npx vitest run`, and `npm run build`.

For Caribbean visual work, review the approved concepts and the documented
current gaps in [the Caribbean map direction](../designs/2026-08-28-caribbean-real-map-direction.md)
before judging implementation parity.
