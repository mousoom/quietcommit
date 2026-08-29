'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, format } = require('../src/conventional');

test('parses a well-formed header with scope and body', () => {
  const msg = `fix(auth): correct token refresh race condition

The refresh timer could fire after logout, re-populating a cleared
session. Guard the callback with a liveness check.

Refs: ENG-1234`;
  const parsed = parse(msg);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.type, 'fix');
  assert.equal(parsed.scope, 'auth');
  assert.equal(parsed.title, 'correct token refresh race condition');
  assert.match(parsed.body, /liveness check/);
  assert.equal(parsed.refs, 'ENG-1234');
  assert.equal(parsed.breaking, false);
});

test('parses breaking change via ! and footer', () => {
  const msg = `feat(api)!: drop support for v1 auth tokens

BREAKING CHANGE: v1 tokens are rejected; clients must migrate to v2.`;
  const parsed = parse(msg);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.breaking, true);
  assert.equal(parsed.breakingDescription, 'v1 tokens are rejected; clients must migrate to v2.');
});

test('rejects an empty message', () => {
  const parsed = parse('');
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.length > 0);
});

test('rejects a header with no type prefix', () => {
  const parsed = parse('fixed the login bug');
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((e) => /format/.test(e)));
});

test('rejects a disallowed type', () => {
  const parsed = parse('feet(auth): typo type', { allowedTypes: ['feat', 'fix'] });
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((e) => /allowed types/.test(e)));
});

test('rejects a title ending in a period', () => {
  const parsed = parse('chore: clean up temp files.');
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((e) => /period/.test(e)));
});

test('flags an overlong header', () => {
  const longTitle = 'a'.repeat(80);
  const parsed = parse(`feat: ${longTitle}`);
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((e) => /72-char cap/.test(e)));
});

test('strips comment lines like git leaves in COMMIT_EDITMSG', () => {
  const msg = `feat(api): add pagination
# Please enter the commit message for your changes.
# Lines starting with '#' will be ignored.`;
  const parsed = parse(msg);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, 'add pagination');
});

test('format() round-trips through parse()', () => {
  const fields = {
    type: 'refactor',
    scope: 'billing',
    title: 'extract invoice formatter into its own module',
    body: 'No behavior change; splits a 400-line file for readability.',
    refs: 'ENG-42',
    breaking: false,
  };
  const message = format(fields);
  const parsed = parse(message);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.type, fields.type);
  assert.equal(parsed.scope, fields.scope);
  assert.equal(parsed.title, fields.title);
  assert.equal(parsed.body, fields.body);
  assert.equal(parsed.refs, fields.refs);
});

test('format() omits scope parens and footers when absent', () => {
  const message = format({ type: 'chore', title: 'bump lockfile' });
  assert.equal(message, 'chore: bump lockfile');
});

test('format() adds BREAKING CHANGE footer and ! marker', () => {
  const message = format({
    type: 'feat',
    scope: 'api',
    title: 'drop v1 endpoint',
    breaking: true,
    breakingDescription: 'v1 endpoint removed',
  });
  assert.match(message, /^feat\(api\)!: drop v1 endpoint/);
  assert.match(message, /BREAKING CHANGE: v1 endpoint removed/);
});
