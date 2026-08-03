#!/usr/bin/env node
/**
 * PreToolUse hook for the Bash tool.
 *
 * Blocks compound shell commands (chained with `&&`, `||`, or `;`) because
 * the project's AGENTS.md requires one logical operation per Bash call.
 * Pipes (`|`) are allowed — they're a single logical operation.
 *
 * Tolerances:
 *   - Ignores `&&`/`||`/`;` inside single, double, and backtick-quoted
 *     strings, and inside `$(...)` / `<(...)` / `>(...)` command
 *     substitutions and process substitutions (anything subshell-ish
 *     reads as one operation from the tool log's perspective).
 *   - Ignores heredoc bodies (`<<EOF … EOF`, `<<-EOF … EOF`, with
 *     optional quoted delimiter).
 *   - Ignores `;` used by bash control structures (before `do`, `then`,
 *     `fi`, `done`, `elif`, `else`, `esac`, or another `;`).
 *
 * On block: emits PreToolUse JSON with permissionDecision=deny and a
 * pointed reason — operator, position, a one-line excerpt with a caret
 * underline, and a leading-command-aware rewrite hint.
 */

// ─────────────────────────────────────────────────────────────────────
// Parsing — strip out anything that isn't a top-level shell statement
// boundary so we can check the remaining structure for chain operators.
// ─────────────────────────────────────────────────────────────────────

/**
 * Replace the interior of quoted strings, command substitutions,
 * process substitutions, and heredoc bodies with spaces so that
 * compound operators inside them don't trip the check.
 *
 * Preserves the SHAPE of the string (every character maps to exactly
 * one output character) so error-message offsets line up with the
 * original input.
 */
function stripNoise(s) {
  const out = [];
  let i = 0;
  const n = s.length;

  while (i < n) {
    const c = s[i];

    // Backslash-escape — copy as-is so e.g. `\\&&` is preserved literally.
    if (c === "\\" && i + 1 < n) {
      out.push(c, s[i + 1]);
      i += 2;
      continue;
    }

    // Single-quoted '…'
    if (c === "'") {
      out.push(" ");
      i += 1;
      while (i < n && s[i] !== "'") {
        out.push(" ");
        i += 1;
      }
      if (i < n) {
        out.push(" "); // closing quote
        i += 1;
      }
      continue;
    }

    // Double-quoted "…" — but $( ) inside is shell substitution. We
    // strip the whole quoted string regardless; the substitution
    // interior is part of an expression, not a separate statement.
    if (c === '"') {
      out.push(" ");
      i += 1;
      while (i < n) {
        if (s[i] === "\\" && i + 1 < n) {
          out.push(" ", " ");
          i += 2;
          continue;
        }
        if (s[i] === '"') {
          out.push(" ");
          i += 1;
          break;
        }
        out.push(" ");
        i += 1;
      }
      continue;
    }

    // Backtick-quoted `…`
    if (c === "`") {
      out.push(" ");
      i += 1;
      while (i < n) {
        if (s[i] === "\\" && i + 1 < n) {
          out.push(" ", " ");
          i += 2;
          continue;
        }
        if (s[i] === "`") {
          out.push(" ");
          i += 1;
          break;
        }
        out.push(" ");
        i += 1;
      }
      continue;
    }

    // $( … ), <( … ), >( … ) — match nested parens, strip the whole
    // payload. From Claude's perspective these are part of a single
    // outer command, not a chain.
    if (
      (c === "$" && i + 1 < n && s[i + 1] === "(") ||
      ((c === "<" || c === ">") && i + 1 < n && s[i + 1] === "(")
    ) {
      out.push(" ", " "); // `$(` / `<(` / `>(`
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (s[i] === "\\" && i + 1 < n) {
          out.push(" ", " ");
          i += 2;
          continue;
        }
        if (s[i] === "(") depth += 1;
        else if (s[i] === ")") depth -= 1;
        out.push(" ");
        i += 1;
      }
      continue;
    }

    // Heredoc: `<<` or `<<-` followed by an optional quoted delimiter
    // then a word. The body runs from the next newline until a line
    // matching that delimiter (with optional leading tabs for `<<-`).
    if (c === "<" && i + 1 < n && s[i + 1] === "<") {
      const dashOffset = s[i + 2] === "-" ? 3 : 2;
      const after = s.slice(i + dashOffset);
      // Optional quoted delimiter: 'WORD' or "WORD"
      const delimMatch = after.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/);
      if (delimMatch) {
        const word = delimMatch[1] ?? delimMatch[2] ?? delimMatch[3] ?? "";
        const headerLen = dashOffset + (delimMatch.index ?? 0) + delimMatch[0].length;
        // Copy the header (`<<EOF`) as spaces
        for (let k = 0; k < headerLen; k++) out.push(" ");
        i += headerLen;
        // Walk to end of line
        while (i < n && s[i] !== "\n") {
          out.push(s[i]);
          i += 1;
        }
        // Body lines, until a closing delimiter line
        const delimRe = new RegExp("^" + (dashOffset === 3 ? "\\t*" : "") + escapeReg(word) + "\\s*$");
        while (i < n) {
          // include the `\n`
          out.push(s[i]);
          i += 1;
          // Read this line
          const lineStart = i;
          while (i < n && s[i] !== "\n") i += 1;
          const line = s.slice(lineStart, i);
          if (delimRe.test(line)) {
            // Emit the closing delimiter line as spaces, not blanks (preserve length)
            for (let k = 0; k < line.length; k++) out.push(" ");
            // We're at `\n` (or n); leave it; main loop continues.
            break;
          } else {
            for (let k = 0; k < line.length; k++) out.push(" ");
          }
        }
        continue;
      }
    }

    out.push(c);
    i += 1;
  }

  return out.join("");
}

function escapeReg(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KEYWORDS_AFTER_SEMI = /^(do|then|fi|done|elif|else|esac)\b/;

/**
 * Scan a noise-stripped command for the FIRST top-level compound
 * operator. Returns { op, index } or null.
 */
function findCompound(stripped) {
  const n = stripped.length;
  let i = 0;
  while (i < n) {
    const ch = stripped[i];
    const next = i + 1 < n ? stripped[i + 1] : "";
    // `&&`
    if (ch === "&" && next === "&") return { op: "&&", index: i };
    // `||` — but not `|` followed by `|` in a `|&` pipeline (rare)
    if (ch === "|" && next === "|") return { op: "||", index: i };
    // `;`
    if (ch === ";") {
      const rest = stripped.slice(i + 1).replace(/^\s+/, "");
      // `;;` in case statements
      if (rest.startsWith(";")) {
        i += 2;
        continue;
      }
      // `; do`, `; then`, `; fi`, …
      if (KEYWORDS_AFTER_SEMI.test(rest)) {
        i += 1;
        continue;
      }
      return { op: ";", index: i };
    }
    i += 1;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Rewrite hints — leading-command-aware suggestions to nudge the agent
// toward the right fix without scolding generically.
// ─────────────────────────────────────────────────────────────────────

/**
 * Look at the bit of command BEFORE the compound operator and the bit
 * AFTER, and return a 1–2 line targeted hint when we recognize a known
 * pattern. Returns null when there's nothing more pointed to say.
 */
function specificHint(cmd, op, index) {
  const left = cmd.slice(0, index).trim();
  const right = cmd.slice(index + op.length).trim();
  if (!left || !right) return null;

  // `cd X && <cmd>` → suggest -C / --cwd or split.
  if (op === "&&" && /^cd\b/.test(left)) {
    const path = left.replace(/^cd\s+/, "").trim();
    const rightTool = right.split(/\s+/)[0] ?? "";
    if (rightTool === "git") {
      return `Replace with one call: \`git -C ${path} ${right.slice(4)}\`.`;
    }
    if (rightTool === "bun" || rightTool === "bunx") {
      return `Replace with one call: \`${rightTool} --cwd=${path} ${right.slice(rightTool.length + 1)}\`.`;
    }
    if (rightTool === "npm" || rightTool === "yarn" || rightTool === "pnpm") {
      return `Replace with one call using \`--prefix=${path}\` (npm) or run \`cd ${path}\` as its own Bash call, then \`${rightTool} ...\` as the next.`;
    }
    if (rightTool === "mix" || rightTool === "iex") {
      return `Mix has no -C. Make \`cd ${path}\` one Bash call, then \`${right}\` the next.`;
    }
    if (rightTool === "docker" || rightTool === "kubectl") {
      return `Pass the path as a flag (\`--context\`, \`-f ${path}/...\`) or split into two calls.`;
    }
    return `Split into two calls: \`cd ${path}\` first, then \`${right}\`.`;
  }

  // `<cmd> ; true` or `<cmd> || true` — the error-swallow idiom.
  // Better suggestion: drop the suppressor, let the failure surface.
  if ((op === ";" || op === "||") && /^(true|false|:)$/.test(right)) {
    return `Drop \`${op} ${right}\` — let the exit code surface. If you genuinely don't care about errors, run \`${left}\` on its own; tool calls don't fail the whole turn.`;
  }

  // `mkdir X && (touch | echo > X/y)` → use the Write tool for the file
  // and `mkdir` as its own call.
  if (op === "&&" && /^mkdir\b/.test(left) && /^(touch|cat\s*>|echo\s.*>)/.test(right)) {
    return `Run \`${left}\` as one call, then use the Write tool to create the file (don't use \`touch\`/\`echo >\` for file creation).`;
  }

  // `find … | xargs cmd1 && cmd2` — agent likely wants find -exec.
  if (op === "&&" && /^find\b/.test(left) && /\bxargs\b/.test(left)) {
    return `Consider \`find ... -exec <cmd> {} +\` so it's a single logical call.`;
  }

  // Generic fallback hints by operator.
  if (op === "&&") {
    return `Use two Bash calls. If you only care about the second running on success of the first, run them sequentially — if the first fails, just don't run the second.`;
  }
  if (op === "||") {
    return `Use two Bash calls. \`a || b\` is "run b if a fails" — handle that by inspecting the first call's result.`;
  }
  if (op === ";") {
    return `Use two Bash calls. Two statements separated by \`;\` is exactly the case this hook exists to split.`;
  }
  return null;
}

/**
 * Format a one-line excerpt around the offending operator with a
 * caret underline, capped to a sensible width.
 */
function excerpt(cmd, index, opLen) {
  const WIDTH = 72;
  const ctx = Math.floor((WIDTH - opLen) / 2);
  const start = Math.max(0, index - ctx);
  const end = Math.min(cmd.length, index + opLen + ctx);
  let slice = cmd.slice(start, end).replace(/\n/g, " ");
  let pointer = " ".repeat(index - start) + "^".repeat(opLen);
  if (start > 0) {
    slice = "…" + slice.slice(1);
    pointer = " " + pointer.slice(1);
  }
  if (end < cmd.length) {
    slice = slice.slice(0, -1) + "…";
  }
  return `  ${slice}\n  ${pointer}`;
}

// ─────────────────────────────────────────────────────────────────────
// I/O — read stdin to EOF, parse JSON, emit decision.
// ─────────────────────────────────────────────────────────────────────

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

(async () => {
  let raw;
  try {
    raw = await readStdin();
  } catch {
    // Couldn't read stdin — fail open.
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Malformed input — fail open.
    process.exit(0);
  }

  const cmd = String(data?.tool_input?.command ?? "");
  if (!cmd) process.exit(0);

  const stripped = stripNoise(cmd);
  const hit = findCompound(stripped);
  if (!hit) process.exit(0);

  const hint = specificHint(cmd, hit.op, hit.index);
  const excerptBlock = excerpt(cmd, hit.index, hit.op.length);

  const reason =
    `Blocked: \`${hit.op}\` chains two commands. AGENTS.md requires one\n` +
    `logical operation per Bash call. Split into separate tool calls.\n\n` +
    `${excerptBlock}\n\n` +
    (hint ? `Hint: ${hint}\n\n` : "") +
    `Pipes (\`|\`) are allowed. Quoted strings, \`$(...)\`, and heredoc\n` +
    `bodies are ignored — put chains in there if you really need them in\n` +
    `one logical call (e.g. \`bash -c "real-script-here"\`).`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
})();
