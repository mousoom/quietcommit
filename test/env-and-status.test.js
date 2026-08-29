'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'quietcommit.js');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function qc(cwd, env, ...args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    // FORCE_COLOR=0 wins over an inherited FORCE_COLOR=1; NO_COLOR is the
    // fallback. Keeps CLI output plain so assertions match regardless of the
    // dev's shell color settings.
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env },
  });
}

function mkrepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-repo-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

// --- envFlag --------------------------------------------------------------

test('envFlag parses boolean-ish env vars', () => {
  const { envFlag } = require('../src/config');
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' on ']) {
    process.env.QC_TEST_FLAG = v;
    assert.equal(envFlag('QC_TEST_FLAG'), true, `expected ${JSON.stringify(v)} truthy`);
  }
  for (const v of ['0', 'false', 'no', 'off', '', 'banana']) {
    process.env.QC_TEST_FLAG = v;
    assert.equal(envFlag('QC_TEST_FLAG'), false, `expected ${JSON.stringify(v)} falsy`);
  }
  delete process.env.QC_TEST_FLAG;
  assert.equal(envFlag('QC_DEFINITELY_UNSET_XYZ'), false);
});

// --- QUIETCOMMIT_STRICT -------------------------------------------------

test('QUIETCOMMIT_STRICT forces requireApproval on in loadConfig', () => {
  const { loadConfig } = require('../src/config');
  const repoRoot = os.tmpdir(); // no .quietcommitrc.json here
  const before = loadConfig({ repoRoot });

  process.env.QUIETCOMMIT_STRICT = '1';
  try {
    assert.equal(loadConfig({ repoRoot }).requireApproval, true);
  } finally {
    delete process.env.QUIETCOMMIT_STRICT;
  }

  assert.equal(loadConfig({ repoRoot }).requireApproval, before.requireApproval);
});

// --- QUIETCOMMIT_DISABLE ----------------------------------------------

test('QUIETCOMMIT_DISABLE makes the prepare-commit-msg hook a no-op', () => {
  const dir = mkrepo();
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    git(dir, 'add', '.');
    const msgFile = path.join(dir, 'MSG');
    fs.writeFileSync(msgFile, 'wip\n');

    qc(dir, { QUIETCOMMIT_DISABLE: '1' }, 'hook-run', 'prepare-commit-msg', msgFile, 'message');

    assert.equal(fs.readFileSync(msgFile, 'utf8'), 'wip\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('without QUIETCOMMIT_DISABLE the same hook rewrites a low-signal message', () => {
  const dir = mkrepo();
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    git(dir, 'add', '.');
    const msgFile = path.join(dir, 'MSG');
    fs.writeFileSync(msgFile, 'wip\n');

    qc(dir, {}, 'hook-run', 'prepare-commit-msg', msgFile, 'message');

    const after = fs.readFileSync(msgFile, 'utf8');
    assert.notEqual(after, 'wip\n');
    assert.match(after, /^(feat|fix|chore|docs|test|build|refactor|perf|ci|style|revert)(\(.+\))?: /);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- worktree hooks-path -------------------------------------------------

test('hooksPath resolves to the common hooks dir from inside a linked worktree', () => {
  const dir = mkrepo();
  const wtParent = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-wt-'));
  const wt = path.join(wtParent, 'wt');
  try {
    fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'init', '-q');
    git(dir, 'worktree', 'add', '-q', wt, '-b', 'wtbranch');

    const gitmod = require('../src/git');
    // realpathSync.native expands Windows 8.3 short names (RUNNER~1) so the two
    // paths compare equal; lower-case guards drive-letter / case differences.
    const norm = (p) => fs.realpathSync.native(p).toLowerCase();
    const resolved = norm(gitmod.hooksPath(wt));

    assert.equal(resolved, norm(path.join(dir, '.git', 'hooks')));
    assert.ok(!resolved.includes('worktrees'), `unexpected per-worktree path: ${resolved}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(wtParent, { recursive: true, force: true });
  }
});

// --- status -----------------------------------------------------------

test('status reports installed shims and effective config', () => {
  const dir = mkrepo();
  try {
    qc(dir, {}, 'install');
    const out = qc(dir, {}, 'status');

    assert.match(out, /prepare-commit-msg: .*installed/);
    assert.match(out, /commit-msg: .*installed/);
    assert.match(out, /Claude Code hook: .*not registered/);
    assert.match(out, /AGENTS\.md block: +absent/);
    assert.match(out, /requireApproval: false/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('status flags QUIETCOMMIT_DISABLE / QUIETCOMMIT_STRICT when set', () => {
  const dir = mkrepo();
  try {
    const out = qc(dir, { QUIETCOMMIT_DISABLE: '1', QUIETCOMMIT_STRICT: '1' }, 'status');
    assert.match(out, /QUIETCOMMIT_DISABLE=1/);
    assert.match(out, /QUIETCOMMIT_STRICT=1/);
    assert.match(out, /requireApproval: true/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
