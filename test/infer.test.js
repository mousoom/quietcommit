'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inferTicket, inferType, inferScope } = require('../src/infer');

test('inferTicket finds TICKET-123 pattern in branch name', () => {
  assert.equal(inferTicket('feature/ENG-1234-fix-thing'), 'ENG-1234');
  assert.equal(inferTicket('ENG-9-quick-fix'), 'ENG-9');
  assert.equal(inferTicket('main'), null);
  assert.equal(inferTicket(''), null);
  assert.equal(inferTicket(null), null);
});

test('inferTicket respects a custom pattern', () => {
  assert.equal(inferTicket('bugfix/JIRA_555', '(JIRA_\\d+)'), 'JIRA_555');
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
