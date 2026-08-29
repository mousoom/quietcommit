'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const git = require('../git');
const { SHIMS, MARKER } = require('./shims');

const HOOK_NAMES = Object.keys(SHIMS);
const GLOBAL_HOOKS_DIR = path.join(os.homedir(), '.quietcommit', 'hooks');

function isQuietcommitShim(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes(MARKER);
}

function installInto(hooksDir) {
  fs.mkdirSync(hooksDir, { recursive: true });
  const results = [];

  for (const name of HOOK_NAMES) {
    const hookPath = path.join(hooksDir, name);
    const backupPath = `${hookPath}.quietcommit-original`;
    let action = 'installed';

    if (fs.existsSync(hookPath) && !isQuietcommitShim(hookPath)) {
      // A real, pre-existing hook — back it up (unless we already have a
      // backup from a previous install, in which case don't clobber it).
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(hookPath, backupPath);
        fs.chmodSync(backupPath, 0o755);
      }
      action = 'installed (chained onto existing hook)';
    } else if (isQuietcommitShim(hookPath)) {
      action = 'reinstalled';
    }

    fs.writeFileSync(hookPath, SHIMS[name](), 'utf8');
    fs.chmodSync(hookPath, 0o755);
    results.push({ name, hookPath, action });
  }

  return results;
}

function uninstallFrom(hooksDir) {
  const results = [];
  for (const name of HOOK_NAMES) {
    const hookPath = path.join(hooksDir, name);
    const backupPath = `${hookPath}.quietcommit-original`;

    if (!fs.existsSync(hookPath) || !isQuietcommitShim(hookPath)) {
      results.push({ name, action: 'skipped (not quietcommit-managed)' });
      continue;
    }

    fs.unlinkSync(hookPath);

    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, hookPath);
      fs.chmodSync(hookPath, 0o755);
      fs.unlinkSync(backupPath);
      results.push({ name, action: 'removed, restored original hook' });
    } else {
      results.push({ name, action: 'removed' });
    }
  }
  return results;
}

/** Per-repo install: honors an existing core.hooksPath if the repo already sets one. */
function installLocal(cwd = process.cwd()) {
  if (!git.isGitRepo(cwd)) {
    throw new Error(`${cwd} is not inside a git repository`);
  }
  const hooksDir = git.hooksPath(cwd);
  return { scope: 'local', hooksDir, results: installInto(hooksDir) };
}

function uninstallLocal(cwd = process.cwd()) {
  const hooksDir = git.hooksPath(cwd);
  return { scope: 'local', hooksDir, results: uninstallFrom(hooksDir) };
}

/**
 * Global install via `core.hooksPath`. We refuse to overwrite a hooksPath
 * the user already has configured for something else — global install is a
 * bigger ask of trust than per-repo, and silently redirecting an existing
 * setup would violate that trust.
 */
function installGlobal() {
  const existing = git.configGet('core.hooksPath', { cwd: os.homedir() });
  if (existing && path.resolve(existing) !== path.resolve(GLOBAL_HOOKS_DIR)) {
    throw new Error(
      `git's global core.hooksPath is already set to "${existing}". ` +
      `quietcommit won't override it automatically — remove that setting or point ` +
      `it at ${GLOBAL_HOOKS_DIR} yourself, then re-run this command.`
    );
  }
  const results = installInto(GLOBAL_HOOKS_DIR);
  git.runOrThrow(['config', '--global', 'core.hooksPath', GLOBAL_HOOKS_DIR]);
  return { scope: 'global', hooksDir: GLOBAL_HOOKS_DIR, results };
}

function uninstallGlobal() {
  const configured = git.configGet('core.hooksPath', { cwd: os.homedir() });
  const results = uninstallFrom(GLOBAL_HOOKS_DIR);
  if (configured && path.resolve(configured) === path.resolve(GLOBAL_HOOKS_DIR)) {
    git.run(['config', '--global', '--unset', 'core.hooksPath'], { cwd: os.homedir() });
  }
  return { scope: 'global', hooksDir: GLOBAL_HOOKS_DIR, results };
}

module.exports = {
  installLocal,
  uninstallLocal,
  installGlobal,
  uninstallGlobal,
  isQuietcommitShim,
  GLOBAL_HOOKS_DIR,
  HOOK_NAMES,
};
