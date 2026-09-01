'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * Thin wrapper around the system `git` binary. We shell out rather than use
 * a git library — simpler, no native bindings, matches the precedent already
 * proven out for this kind of tool (braglog, better-commits).
 */

function run(args, opts = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    ...opts,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function runOrThrow(args, opts = {}) {
  const result = run(args, opts);
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr || `exit ${result.status}`}`);
  }
  return (result.stdout || '').trim();
}

function isGitRepo(cwd = process.cwd()) {
  const result = run(['rev-parse', '--is-inside-work-tree'], { cwd });
  return result.status === 0 && result.stdout.trim() === 'true';
}

function repoRoot(cwd = process.cwd()) {
  return runOrThrow(['rev-parse', '--show-toplevel'], { cwd });
}

function gitDir(cwd = process.cwd()) {
  return runOrThrow(['rev-parse', '--git-dir'], { cwd });
}

function currentBranch(cwd = process.cwd()) {
  const result = run(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd });
  if (result.status === 0) return result.stdout.trim();
  // Detached HEAD — fall back to a short SHA rather than throwing.
  const sha = run(['rev-parse', '--short', 'HEAD'], { cwd });
  return sha.status === 0 ? sha.stdout.trim() : '';
}

/** Names of files staged for commit, with their status letter (A/M/D/R/etc). */
function stagedFiles(cwd = process.cwd()) {
  const out = runOrThrow(['diff', '--cached', '--name-status'], { cwd });
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status: status[0], path: rest[rest.length - 1] };
    });
}

/** Full staged diff text (used for drafting/inference). */
function stagedDiff(cwd = process.cwd()) {
  return runOrThrow(['diff', '--cached'], { cwd });
}

/** Compact --stat summary of the staged diff. */
function stagedDiffStat(cwd = process.cwd()) {
  return runOrThrow(['diff', '--cached', '--stat'], { cwd });
}

function hasStagedChanges(cwd = process.cwd()) {
  const result = run(['diff', '--cached', '--quiet'], { cwd });
  // exit 1 means there IS a diff; exit 0 means no diff.
  return result.status === 1;
}

function configGet(key, opts = {}) {
  const result = run(['config', '--get', key], opts);
  return result.status === 0 ? result.stdout.trim() : null;
}

function configGetAll(scope, cwd = process.cwd()) {
  // scope: '--local' | '--global'
  const result = run(['config', scope, '--list'], { cwd });
  if (result.status !== 0) return {};
  const out = {};
  for (const line of result.stdout.split('\n')) {
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

/**
 * Absolute path to the hooks directory git would actually execute from when
 * `core.hooksPath` is NOT set. `git rev-parse --git-path hooks` accounts for
 * linked worktrees (where the per-worktree git dir is `.git/worktrees/<name>`
 * but hooks still run from the common git dir), which naive `<git-dir>/hooks`
 * construction gets wrong.
 */
function commonHooksDir(cwd = process.cwd()) {
  const abs = run(['rev-parse', '--path-format=absolute', '--git-path', 'hooks'], { cwd });
  if (abs.status === 0 && abs.stdout.trim()) return abs.stdout.trim();
  // Older git without --path-format: the value may be relative to cwd.
  const rel = runOrThrow(['rev-parse', '--git-path', 'hooks'], { cwd });
  return path.resolve(cwd, rel);
}

function hooksPath(cwd = process.cwd()) {
  // Resolve the effective hooks directory the way git itself would:
  // core.hooksPath if set (git resolves a relative value against the working
  // tree root), otherwise the common git dir's hooks/.
  const configured = configGet('core.hooksPath', { cwd });
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(repoRoot(cwd), configured);
  }
  return commonHooksDir(cwd);
}

/**
 * Absolute path to `.git/info/exclude` — the per-clone ignore file that is
 * never committed or shared. Worktree-safe via `git rev-parse --git-path`.
 */
function infoExcludePath(cwd = process.cwd()) {
  const abs = run(['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'], { cwd });
  if (abs.status === 0 && abs.stdout.trim()) return abs.stdout.trim();
  const rel = runOrThrow(['rev-parse', '--git-path', 'info/exclude'], { cwd });
  return path.resolve(cwd, rel);
}

module.exports = {
  run,
  runOrThrow,
  isGitRepo,
  repoRoot,
  gitDir,
  currentBranch,
  stagedFiles,
  stagedDiff,
  stagedDiffStat,
  hasStagedChanges,
  configGet,
  configGetAll,
  hooksPath,
  commonHooksDir,
  infoExcludePath,
};
