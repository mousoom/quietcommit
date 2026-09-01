'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'quietcommit.js');
const gitExclude = require('../src/git-exclude');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
function qc(cwd, ...args) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
}
function mkrepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-lo-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@e.com');
  git(dir, 'config', 'user.name', 't');
  return dir;
}

// --- git-exclude unit -------------------------------------------------

test('applyLocalExclude writes, refreshes, and removes its own block', () => {
  const dir = mkrepo();
  try {
    const excl = path.join(dir, '.git', 'info', 'exclude');
    const original = fs.readFileSync(excl, 'utf8');

    let r = gitExclude.applyLocalExclude(dir, ['.claude/', 'AGENTS.md']);
    assert.equal(r.action, 'added');
    let text = fs.readFileSync(excl, 'utf8');
    assert.ok(text.startsWith(original.replace(/\s*$/, '')));
    assert.match(text, /quietcommit:begin local-only/);
    assert.match(text, /^\.claude\/$/m);
    assert.match(text, /^AGENTS\.md$/m);

    r = gitExclude.applyLocalExclude(dir, ['.claude/', 'AGENTS.md']);
    assert.equal(r.action, 'unchanged');

    r = gitExclude.applyLocalExclude(dir, ['.claude/']);
    assert.equal(r.action, 'updated');
    assert.doesNotMatch(fs.readFileSync(excl, 'utf8'), /^AGENTS\.md$/m);

    r = gitExclude.removeLocalExclude(dir);
    assert.equal(r.action, 'removed');
    assert.equal(fs.readFileSync(excl, 'utf8').replace(/\s+$/, ''), original.replace(/\s+$/, ''));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyLocalExclude preserves unrelated user entries', () => {
  const dir = mkrepo();
  try {
    const excl = path.join(dir, '.git', 'info', 'exclude');
    fs.appendFileSync(excl, '\nmy-scratch-notes.txt\n');
    gitExclude.applyLocalExclude(dir, ['.claude/']);
    gitExclude.removeLocalExclude(dir);
    assert.match(fs.readFileSync(excl, 'utf8'), /^my-scratch-notes\.txt$/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- install --local-only end to end -------------------------------

test('install --claude-code --local-only hides the integration files from git', () => {
  const dir = mkrepo();
  try {
    const out = qc(dir, 'install', '--claude-code', '--cursor', '--local-only');
    assert.match(out, /\.git\/info\/exclude added/);

    // the files exist on disk...
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'settings.json')));
    assert.ok(fs.existsSync(path.join(dir, '.cursor', 'rules', 'quietcommit.mdc')));
    // ...but git does not see them
    assert.equal(git(dir, 'status', '--porcelain'), '');

    assert.match(qc(dir, 'status'), /local-only exclude: on \(4 path/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('uninstall strips the local-only exclude block', () => {
  const dir = mkrepo();
  try {
    qc(dir, 'install', '--claude-code', '--local-only');
    qc(dir, 'uninstall', '--claude-code');
    const excl = fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8');
    assert.doesNotMatch(excl, /quietcommit:begin local-only/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--local-only with no integration flag warns instead of touching exclude', () => {
  const dir = mkrepo();
  try {
    const out = qc(dir, 'install', '--local-only');
    assert.match(out, /nothing to exclude/);
    assert.doesNotMatch(
      fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8'),
      /quietcommit/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
