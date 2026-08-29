'use strict';

const DEFAULT_TICKET_PATTERN = '([A-Z][A-Z0-9]+-\\d+)';

/**
 * Infer a ticket ID from a branch name, e.g. "feature/ENG-1234-fix-thing"
 * -> "ENG-1234". Returns null if nothing matches.
 */
function inferTicket(branchName, ticketPattern = DEFAULT_TICKET_PATTERN) {
  if (!branchName) return null;
  let re;
  try {
    re = new RegExp(ticketPattern);
  } catch {
    re = new RegExp(DEFAULT_TICKET_PATTERN);
  }
  const match = re.exec(branchName);
  return match ? match[1] : null;
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
function inferType(files) {
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

module.exports = { inferTicket, inferType, inferScope, DEFAULT_TICKET_PATTERN };
