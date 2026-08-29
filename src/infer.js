'use strict';

const { DEFAULT_TYPES } = require('./conventional');

const DEFAULT_TICKET_PATTERN = '([A-Z][A-Z0-9]+-\\d+)';

// Ordered branch-name ticket patterns, most-specific delimiter first — the
// first one that matches wins. Modelled on better-commits' approach so we
// also catch underscore-delimited keys, lowercase project keys, and bare
// numeric issue IDs (GitHub / GitLab style), not just "ENG-1234".
const TICKET_PATTERNS = [
  /^([A-Za-z]+-[A-Za-z0-9]+)_/,      // ABC-12_add-thing
  /\/([A-Za-z]+-[A-Za-z0-9]+)_/,     // feature/ABC-12_add-thing
  /\/(\w+-\d+)/,                     // feature/ENG-1234-add-thing
  /\/(\d+)(?:[-_/]|$)/,              // feature/1234-add-thing
  /^(\w+-\d+)/,                      // ENG-1234-add-thing
  /^(\d+)(?:[-_/]|$)/,               // 1234-add-thing
];

/**
 * Infer a ticket ID from a branch name, e.g. "feature/ENG-1234-fix-thing"
 * -> "ENG-1234". Returns null if nothing matches.
 *
 * A caller-supplied `ticketPattern` that differs from the built-in default
 * is honoured as-is (single regex, first capture group). Otherwise the
 * ordered `TICKET_PATTERNS` list above is tried in turn.
 */
function inferTicket(branchName, ticketPattern = DEFAULT_TICKET_PATTERN) {
  if (!branchName) return null;

  if (ticketPattern && ticketPattern !== DEFAULT_TICKET_PATTERN) {
    try {
      const match = new RegExp(ticketPattern).exec(branchName);
      if (match) return match[1] || match[0];
    } catch {
      // bad custom pattern — fall through to the built-in ordered list
    }
  }

  for (const re of TICKET_PATTERNS) {
    const match = re.exec(branchName);
    if (match) return match[1];
  }
  return null;
}

/**
 * Infer a Conventional Commits `type` from an explicit branch prefix, e.g.
 * "feat/add-x" -> "feat", "fix-123-thing" -> "fix". Checked against the
 * allowed type list; returns null if no type appears as a delimited token.
 */
function inferTypeFromBranch(branchName, allowedTypes = DEFAULT_TYPES) {
  if (!branchName) return null;
  for (const type of allowedTypes) {
    const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[/_-])${escaped}([/_-])`).test(branchName)) return type;
  }
  return null;
}

// Path-based heuristics, checked in order — first match wins.
const TYPE_RULES = [
  { test: (p) => /(^|\/)test(s)?\//.test(p) || /\.(test|spec)\.[jt]sx?$/.test(p), type: 'test' },
  { test: (p) => /(^|\/)docs?\//.test(p) || /\.(md|mdx)$/i.test(p) || /^readme/i.test(p), type: 'docs' },
  { test: (p) => /(^|\/)\.github\/workflows\//.test(p) || /\.ya?ml$/.test(p) && /(ci|workflow)/i.test(p), type: 'ci' },
  { test: (p) => /(^|\/)(dockerfile|makefile)$/i.test(p) || /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig.*\.json|webpack\.config\.[jt]s|vite\.config\.[jt]s|rollup\.config\.[jt]s)$/i.test(p), type: 'build' },
  { test: (p) => /\.(css|scss|less|styl)$/i.test(p), type: 'style' },
];

/**
 * Infer a Conventional Commits `type` from the set of staged files.
 * Falls back to 'chore' if nothing about the change set is distinctive,
 * or 'feat'/'fix' can't reliably be told apart by path alone — callers
 * with diff content available should prefer a smarter signal where possible;
 * this is the honest, no-AI baseline.
 */
function inferType(files, branch, allowedTypes = DEFAULT_TYPES) {
  if (!files || files.length === 0) return 'chore';

  const paths = files.map((f) => f.path);
  const allDeleted = files.every((f) => f.status === 'D');
  if (allDeleted) return 'chore';

  const allAdded = files.every((f) => f.status === 'A');

  for (const rule of TYPE_RULES) {
    if (paths.every((p) => rule.test(p))) {
      return rule.type;
    }
  }

  // Mixed changes: if every file matches at least one non-code rule, and the
  // set isn't purely additions, treat as chore; new files leaning toward feat.
  const nonCode = paths.every((p) => TYPE_RULES.some((r) => r.test(p)));
  if (nonCode) return 'chore';

  // Path heuristics can't tell feat from fix — an explicit branch prefix
  // (feat/…, fix/…, refactor/…) is a stronger signal than guessing by status.
  const fromBranch = inferTypeFromBranch(branch, allowedTypes);
  if (fromBranch) return fromBranch;

  return allAdded ? 'feat' : 'fix';
}

/**
 * Infer a `scope` from changed file paths — the shared top-level directory,
 * or null if changes span unrelated top-level areas.
 */
function inferScope(files) {
  if (!files || files.length === 0) return null;

  const tops = new Set(
    files.map((f) => {
      const parts = f.path.split('/');
      return parts.length > 1 ? parts[0] : null;
    })
  );

  if (tops.size === 1) {
    const [only] = tops;
    return only; // may be null if all files are root-level
  }
  return null;
}

module.exports = { inferTicket, inferType, inferTypeFromBranch, inferScope, DEFAULT_TICKET_PATTERN };
