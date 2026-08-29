'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SHIMS } = require('../src/hooks/shims');
const { REPO_URL } = require('../src/meta');
const { conventionMarkdown } = require('../src/integrations/convention');
const agentsMd = require('../src/integrations/agents-md');
const editorRules = require('../src/integrations/editor-rules');
const claudeCode = require('../src/integrations/claude-code');

const CLI = path.join(__dirname, '..', 'bin', 'quietcommit.js');

function mkdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qc-int-'));
}
function mkrepo() {
  const dir = mkdir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  return dir;
}
function qc(cwd, ...args) {
  return execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

// --- generated files carry the real repo URL --------------------------

test('hook shims interpolate the package repo URL, not a placeholder', () => {
  assert.match(REPO_URL, /^https:\/\/github\.com\/[^/]+\/quietcommit$/);
  for (const name of Object.keys(SHIMS)) {
    const body = SHIMS[name]();
    assert.ok(body.includes(`Installed by quietcommit — ${REPO_URL}`), `${name} shim URL`);
    assert.doesNotMatch(body, /\$\{REPO_URL\}/, `${name} shim left an un-interpolated token`);
  }
});

// --- convention text --------------------------------------------------

test('conventionMarkdown reflects allowedTypes from config', () => {
  const md = conventionMarkdown({ allowedTypes: ['feat', 'fix', 'chore'] });
  assert.match(md, /one of feat, fix, chore\./);
  assert.match(md, /Conventional Commits/);
});

// --- AGENTS.md (refactored onto the shared marker-block helper) -------

test('AGENTS.md: create, idempotent update, uninstall deletes when empty', () => {
  const dir = mkdir();
  try {
    const a = agentsMd.installAgentsMd(dir, {});
    assert.equal(a.action, 'created');
    assert.ok(agentsMd.agentsMdStatus(dir).present);

    const b = agentsMd.installAgentsMd(dir, {});
    assert.equal(b.action, 'unchanged');

    const u = agentsMd.uninstallAgentsMd(dir);
    assert.equal(u.action, 'removed (file now empty)');
    assert.ok(!fs.existsSync(path.join(dir, 'AGENTS.md')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AGENTS.md: block is appended to a pre-existing file and only the block is removed', () => {
  const dir = mkdir();
  const file = path.join(dir, 'AGENTS.md');
  try {
    fs.writeFileSync(file, '# House rules\n\nBe nice.\n');
    const a = agentsMd.installAgentsMd(dir, {});
    assert.equal(a.action, 'appended');
    assert.match(fs.readFileSync(file, 'utf8'), /Be nice\./);

    agentsMd.uninstallAgentsMd(dir);
    const left = fs.readFileSync(file, 'utf8');
    assert.match(left, /Be nice\./);
    assert.doesNotMatch(left, /quietcommit:begin/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Cursor rule ----------------------------------------------------

test('Cursor: .mdc written with frontmatter + block, status, uninstall', () => {
  const dir = mkdir();
  const file = path.join(dir, '.cursor', 'rules', 'quietcommit.mdc');
  try {
    const r = editorRules.installCursor(dir, {});
    assert.equal(r.action, 'created');
    const content = fs.readFileSync(file, 'utf8');
    assert.match(content, /^---\n/);
    assert.match(content, /alwaysApply: true/);
    assert.match(content, /quietcommit:begin/);
    assert.ok(editorRules.cursorStatus(dir).present);

    const u = editorRules.uninstallCursor(dir);
    assert.equal(u.action, 'removed (file now empty)');
    assert.ok(!fs.existsSync(file));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Copilot instructions -----------------------------------------

test('Copilot: block appended to an existing instructions file survives uninstall', () => {
  const dir = mkdir();
  const file = path.join(dir, '.github', 'copilot-instructions.md');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Copilot instructions\n\nUse tabs.\n');
    const r = editorRules.installCopilot(dir, {});
    assert.equal(r.action, 'appended');
    assert.ok(editorRules.copilotStatus(dir).present);

    editorRules.uninstallCopilot(dir);
    const left = fs.readFileSync(file, 'utf8');
    assert.match(left, /Use tabs\./);
    assert.doesNotMatch(left, /quietcommit:begin/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Claude Code skill --------------------------------------------

test('Claude Code install copies the /quietcommit skill; uninstall removes it', () => {
  const dir = mkrepo();
  try {
    const r = claudeCode.installClaudeCode(dir);
    assert.ok(r.skillPath && fs.existsSync(r.skillPath));
    assert.match(fs.readFileSync(r.skillPath, 'utf8'), /^---\nname: quietcommit/);
    assert.ok(claudeCode.claudeCodeStatus(dir).skillInstalled);
    assert.ok(claudeCode.claudeCodeStatus(dir).registered);

    const u = claudeCode.uninstallClaudeCode(dir);
    assert.equal(u.removedSkill, true);
    assert.ok(!fs.existsSync(r.skillPath));
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'skills')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- install --all end to end -----------------------------------

test('install --all wires every integration and status reports them', () => {
  const dir = mkrepo();
  try {
    qc(dir, 'install', '--all');
    const out = qc(dir, 'status');
    assert.match(out, /prepare-commit-msg: .*installed/);
    assert.match(out, /Claude Code hook: .*registered/);
    assert.match(out, /\/quietcommit skill: .*installed/);
    assert.match(out, /AGENTS\.md block: +present/);
    assert.match(out, /Cursor rule: +present/);
    assert.match(out, /Copilot block: +present/);

    qc(dir, 'uninstall', '--all');
    const out2 = qc(dir, 'status');
    assert.match(out2, /AGENTS\.md block: +absent/);
    assert.match(out2, /Cursor rule: +absent/);
    assert.match(out2, /Copilot block: +absent/);
    assert.match(out2, /\/quietcommit skill: .*not installed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
