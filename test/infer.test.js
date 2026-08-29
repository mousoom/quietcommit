'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inferTicket, inferType, inferTypeFromBranch, inferScope } = require('../src/infer');

test('inferTicket finds TICKET-123 pattern in branch name', () => {
  assert.equal(inferTicket('feature/ENG-1234-fix-thing'), 'ENG-1234');
  assert.equal(inferTicket('ENG-9-quick-fix'), 'ENG-9');
  assert.equal(inferTicket('main'), null);
  assert.equal(inferTicket(''), null);
  assert.equal(inferTicket(null), null);
});

test('inferTicket handles bare numeric issue IDs (GitHub/GitLab style)', () => {
  assert.equal(inferTicket('feature/1234-add-thing'), '1234');
  assert.equal(inferTicket('1234-add-thing'), '1234');
  assert.equal(inferTicket('feature/1234'), '1234');
});

test('inferTicket handles lowercase project keys and underscore separators', () => {
  assert.equal(inferTicket('feature/eng-1234-add-thing'), 'eng-1234');
  assert.equal(inferTicket('ABC-12_add-thing'), 'ABC-12');
  assert.equal(inferTicket('feature/ABC-12_add-thing'), 'ABC-12');
});

test('inferTicket prefers a slash-delimited key over an earlier branch segment', () => {
  assert.equal(inferTicket('john/PLATFORM-2-add-thing'), 'PLATFORM-2');
});

test('inferTicket respects a custom pattern', () => {
  assert.equal(inferTicket('bugfix/JIRA_555', '(JIRA_\\d+)'), 'JIRA_555');
});

test('inferTypeFromBranch reads an explicit branch prefix', () => {
  assert.equal(inferTypeFromBranch('feat/add-x'), 'feat');
  assert.equal(inferTypeFromBranch('fix-123-thing'), 'fix');
  assert.equal(inferTypeFromBranch('chore/deps'), 'chore');
  assert.equal(inferTypeFromBranch('my-feature-branch'), null);
  assert.equal(inferTypeFromBranch('main'), null);
  assert.equal(inferTypeFromBranch(''), null);
});

test('inferType uses the branch prefix to break the feat/fix guess', () => {
  const modified = [{ status: 'M', path: 'src/existing.js' }];
  assert.equal(inferType(modified, 'feat/new-thing'), 'feat');

  const added = [{ status: 'A', path: 'src/new.js' }];
  assert.equal(inferType(added, 'fix/regression'), 'fix');
});

test('inferType still falls back to the status guess with no branch signal', () => {
  assert.equal(inferType([{ status: 'M', path: 'src/existing.js' }], 'main'), 'fix');
  assert.equal(inferType([{ status: 'A', path: 'src/new.js' }], 'main'), 'feat');
});

test('inferType detects test-only changes', () => {
  const files = [
    { status: 'M', path: 'test/foo.test.js' },
    { status: 'A', path: 'src/foo.spec.ts' },
  ];
  assert.equal(inferType(files), 'test');
});

test('inferType detects docs-only changes', () => {
  const files = [{ status: 'M', path: 'README.md' }, { status: 'A', path: 'docs/guide.md' }];
  assert.equal(inferType(files), 'docs');
});

test('inferType detects build/config changes', () => {
  const files = [{ status: 'M', path: 'package.json' }];
  assert.equal(inferType(files), 'build');
});

test('inferType defaults to feat for all-new source files', () => {
  const files = [{ status: 'A', path: 'src/new-feature.js' }];
  assert.equal(inferType(files), 'feat');
});

test('inferType defaults to fix for modifications to existing source files', () => {
  const files = [{ status: 'M', path: 'src/existing.js' }];
  assert.equal(inferType(files), 'fix');
});

test('inferType returns chore for pure deletions', () => {
  const files = [{ status: 'D', path: 'src/dead-code.js' }];
  assert.equal(inferType(files), 'chore');
});

test('inferType returns chore for an empty file list', () => {
  assert.equal(inferType([]), 'chore');
});

test('inferScope returns the shared top-level directory', () => {
  const files = [{ status: 'M', path: 'src/auth/login.js' }, { status: 'M', path: 'src/auth/logout.js' }];
  assert.equal(inferScope(files), 'src');
});

test('inferScope returns null when changes span unrelated top-level areas', () => {
  const files = [{ status: 'M', path: 'src/foo.js' }, { status: 'M', path: 'docs/readme.md' }];
  assert.equal(inferScope(files), null);
});

test('inferScope returns null for a single root-level file', () => {
  assert.equal(inferScope([{ status: 'M', path: 'package.json' }]), null);
});
