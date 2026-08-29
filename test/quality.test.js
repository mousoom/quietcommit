'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkQuality } = require('../src/quality');

test('a well-formed message passes with no errors', () => {
  const { valid, errors } = checkQuality('fix(auth): correct token refresh race condition\n\nGuards the refresh callback against firing after logout.');
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test('rejects low-signal titles like "wip" and "fix"', () => {
  assert.equal(checkQuality('chore: wip').valid, false);
  assert.equal(checkQuality('fix: fix').valid, false);
  assert.equal(checkQuality('chore: update').valid, false);
});

test('warns (does not block) when a non-trivial diff has no body', () => {
  const { valid, warnings } = checkQuality('feat(api): add pagination support', {
    diffStats: { linesChanged: 200, filesChanged: 8 },
  });
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /consider a body/.test(w)));
});

test('does not warn for a small diff without a body', () => {
  const { warnings } = checkQuality('fix(api): correct off-by-one in pagination', {
    diffStats: { linesChanged: 3, filesChanged: 1 },
  });
  assert.deepEqual(warnings, []);
});

test('rejects an unparseable message', () => {
  const { valid, errors } = checkQuality('did some stuff');
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

test('respects a custom allowedTypes list from config', () => {
  const { valid, errors } = checkQuality('feature(x): add thing', {
    config: { allowedTypes: ['feat', 'fix'] },
  });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /allowed types/.test(e)));
});
