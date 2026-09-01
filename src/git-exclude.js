'use strict';

const fs = require('node:fs');
const git = require('./git');

// A quietcommit-owned block inside .git/info/exclude — the per-clone ignore
// file that is never committed or pushed. `--local-only` uses this so an
// agent-integration file (`.claude/…`, `AGENTS.md`, …) works locally but
// never lands in a shared branch. The shared `.gitignore` is deliberately
// NOT touched — editing it would itself be a change that gets pushed.

const BEGIN = '# quietcommit:begin local-only (managed — do not edit)';
const END = '# quietcommit:end local-only';

function stripBlock(text) {
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b === -1 || e === -1) return text;
  return (text.slice(0, b) + text.slice(e + END.length)).replace(/\n{3,}/g, '\n\n');
}

/**
 * Write (or refresh) the quietcommit block in .git/info/exclude with exactly
 * `paths` (repo-root-relative, POSIX slashes). Passing an empty list removes
 * the block. Returns { excludePath, action }.
 */
function applyLocalExclude(cwd, paths) {
  const excludePath = git.infoExcludePath(cwd);
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  const withoutOurs = stripBlock(existing);

  if (!paths || paths.length === 0) {
    if (withoutOurs === existing) return { excludePath, action: 'nothing to exclude' };
    fs.writeFileSync(excludePath, withoutOurs.replace(/\s*$/, '\n'), 'utf8');
    return { excludePath, action: 'removed' };
  }

  const block = [BEGIN, ...paths, END].join('\n');
  const base = withoutOurs.replace(/\s*$/, '');
  const next = (base ? base + '\n\n' : '') + block + '\n';
  const had = existing.includes(BEGIN);
  if (next === existing) return { excludePath, action: 'unchanged' };
  fs.writeFileSync(excludePath, next, 'utf8');
  return { excludePath, action: had ? 'updated' : 'added' };
}

function removeLocalExclude(cwd) {
  return applyLocalExclude(cwd, []);
}

function localExcludeStatus(cwd) {
  let excludePath;
  try {
    excludePath = git.infoExcludePath(cwd);
  } catch {
    return { applied: false, paths: [] };
  }
  if (!fs.existsSync(excludePath)) return { applied: false, paths: [], excludePath };
  const text = fs.readFileSync(excludePath, 'utf8');
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b === -1 || e === -1) return { applied: false, paths: [], excludePath };
  const paths = text
    .slice(b + BEGIN.length, e)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return { applied: true, paths, excludePath };
}

module.exports = { applyLocalExclude, removeLocalExclude, localExcludeStatus, BEGIN, END };
