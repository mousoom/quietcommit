'use strict';

const { parse, TITLE_MAX_LEN } = require('./conventional');

// A diff at or above this many changed lines is "non-trivial" and, in
// approval mode, is expected to carry a body explaining the change.
const NONTRIVIAL_LINE_THRESHOLD = 40;
const NONTRIVIAL_FILE_THRESHOLD = 5;

/**
 * Validate a candidate commit message against quietcommit's quality bar.
 * Used by: the commit-msg hook in approval mode (non-interactive commits),
 * and the Claude Code PreToolUse gate (validating an agent's proposed
 * `git commit -m "..."` before letting it through).
 *
 * Returns { valid, errors, warnings }. `errors` block the commit in
 * approval mode; `warnings` never block, they're informational.
 */
function checkQuality(message, { config, diffStats } = {}) {
  const allowedTypes = (config && config.allowedTypes) || undefined;
  const parsed = parse(message, { allowedTypes });

  const errors = [...parsed.errors];
  const warnings = [];

  if (diffStats) {
    const { linesChanged = 0, filesChanged = 0 } = diffStats;
    const nontrivial =
      linesChanged >= NONTRIVIAL_LINE_THRESHOLD || filesChanged >= NONTRIVIAL_FILE_THRESHOLD;
    if (nontrivial && (!parsed.body || !parsed.body.trim())) {
      warnings.push(
        `this touches ${filesChanged} file(s) / ~${linesChanged} lines — consider a body explaining what changed`
      );
    }
  }

  if (parsed.title && /^(wip|fix|update|stuff|misc|changes?)$/i.test(parsed.title.trim())) {
    errors.push(`title "${parsed.title}" is too low-signal to be useful in a commit log`);
  }

  return { valid: errors.length === 0, errors, warnings, parsed };
}

function diffStatsFromFiles(files) {
  return { filesChanged: files.length };
}

module.exports = { checkQuality, NONTRIVIAL_LINE_THRESHOLD, NONTRIVIAL_FILE_THRESHOLD, diffStatsFromFiles, TITLE_MAX_LEN };
