'use strict';

const path = require('node:path');
const git = require('../git');
const draft = require('../draft');
const quality = require('../quality');

// Matches `git commit`, `git -C <dir> commit`, `git --no-pager commit`, etc.
const GIT_COMMIT_RE = /\bgit\s+(?:-C\s+\S+\s+)?(?:--\S+\s+)*commit\b/;
const MESSAGE_FLAG_RE = /(?:^|\s)(?:-m|--message)(?:=|\s+)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)/g;
const AMEND_RE = /\B--amend\b/;
const NO_EDIT_RE = /\B--no-edit\b/;

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Best-effort extraction of `-m`/`--message` values from a shell command
 * string. This is not a full shell parser — it's a pragmatic regex approach
 * that covers the overwhelming majority of real `git commit` invocations an
 * agent actually writes. Multiple -m flags are joined the way git itself
 * joins them: as separate paragraphs.
 */
function extractMessage(command) {
  const parts = [];
  let match;
  MESSAGE_FLAG_RE.lastIndex = 0;
  while ((match = MESSAGE_FLAG_RE.exec(command))) {
    parts.push(unquote(match[1]));
  }
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Decide what to do about one Bash tool call, as a PreToolUse hook.
 * Returns null if we have nothing to say (let the normal permission flow
 * proceed untouched), or a hookSpecificOutput object to deny the call with.
 */
async function evaluateBashCall({ command, cwd, config }) {
  if (!command || !GIT_COMMIT_RE.test(command)) {
    return null; // not a commit — nothing to do
  }

  if (AMEND_RE.test(command) && !extractMessage(command)) {
    return null; // amend reusing the previous message (with/without --no-edit) — leave it
  }

  const message = extractMessage(command);

  if (!message) {
    // No -m/--message at all: this would try to open an interactive editor,
    // which hangs in a non-interactive tool call. Redirect rather than let
    // it stall.
    let suggestion = null;
    try {
      const draftResult = await draft.draft({ cwd, config });
      suggestion = draft.draftToMessage(draftResult);
    } catch (err) {
      return {
        permissionDecision: 'deny',
        permissionDecisionReason:
          `quietcommit: "git commit" needs a -m message in a non-interactive context ` +
          `(an editor can't open here), and no changes are staged to draft one from (${err.message}). ` +
          `Stage your changes first, then include -m.`,
      };
    }
    return {
      permissionDecision: 'deny',
      permissionDecisionReason:
        `quietcommit: "git commit" needs a -m message in a non-interactive context. ` +
        `Retry with:\n\ngit commit -m ${JSON.stringify(suggestion)}\n\n` +
        `(edit the drafted message above if it doesn't capture the change well — you have the ` +
        `full task context quietcommit doesn't).`,
    };
  }

  let diffStats;
  try {
    diffStats = quality.diffStatsFromFiles(git.stagedFiles(cwd));
  } catch {
    diffStats = undefined;
  }

  const check = quality.checkQuality(message, { config, diffStats });
  if (check.valid) {
    return null; // good message — let it through
  }

  let suggestion = null;
  try {
    const draftResult = await draft.draft({ cwd, config });
    suggestion = draft.draftToMessage(draftResult);
  } catch {
    // no staged changes to draft from, or draft failed — still deny with
    // the raw quality errors, just without a ready-made replacement.
  }

  const reasonLines = [
    `quietcommit: this commit message doesn't meet the format quietcommit enforces here:`,
    ...check.errors.map((e) => `  - ${e}`),
  ];
  if (suggestion) {
    reasonLines.push(
      '',
      `Retry with a properly-formatted message, e.g.:`,
      '',
      `git commit -m ${JSON.stringify(suggestion)}`,
      '',
      `(you have full task context — feel free to write a better title/body than the draft above, ` +
      `just keep the "type(scope): title" structure).`
    );
  } else {
    reasonLines.push(
      '',
      `Retry with a "type(scope): title" header (types: ${(config.allowedTypes || []).join(', ')}) ` +
      `and, for anything non-trivial, a short body explaining what changed.`
    );
  }

  return {
    permissionDecision: 'deny',
    permissionDecisionReason: reasonLines.join('\n'),
  };
}

/**
 * Entry point invoked by the shell shim: reads a Claude Code PreToolUse
 * hook payload from stdin, writes the hookSpecificOutput decision (if any)
 * to stdout, and always exits 0 — denial is communicated through the JSON
 * payload, not the exit code, per Claude Code's hooks contract.
 */
async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // malformed input — fail open, don't block the agent
  }

  if (!input || input.tool_name !== 'Bash') {
    process.exit(0);
  }

  const command = input.tool_input && input.tool_input.command;
  const cwd = input.cwd || process.cwd();

  const { loadConfig } = require('../config');
  let config;
  try {
    const root = git.isGitRepo(cwd) ? git.repoRoot(cwd) : cwd;
    config = loadConfig({ repoRoot: root });
  } catch {
    process.exit(0); // not a git repo / can't load config — nothing to enforce
  }

  let decision;
  try {
    decision = await evaluateBashCall({ command, cwd, config });
  } catch {
    process.exit(0); // never let an internal error block an unrelated Bash call
  }

  if (decision) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision },
      })
    );
  }
  process.exit(0);
}

module.exports = { evaluateBashCall, extractMessage, GIT_COMMIT_RE, main };
