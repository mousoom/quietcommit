'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { shellSingleQuote } = require('../src/hooks/claude-pretooluse');

test('shellSingleQuote wraps a plain string', () => {
  assert.equal(shellSingleQuote('feat: add thing'), "'feat: add thing'");
});

test('shellSingleQuote neutralizes shell metacharacters in a suggestion', () => {
  // A staged filename can legally contain backticks or $(): the suggested
  // retry command must not let those run when pasted into a shell.
  const dangerous = 'chore: update `id`.js and $(whoami).txt';
  const quoted = shellSingleQuote(dangerous);
  const out = execFileSync('sh', ['-c', `printf %s ${quoted}`], { encoding: 'utf8' });
  assert.equal(out, dangerous);
});

test('shellSingleQuote round-trips embedded single quotes and newlines', () => {
  const msg = "fix(parser): don't drop the trailer\n\nBody line.";
  const quoted = shellSingleQuote(msg);
  const out = execFileSync('sh', ['-c', `printf %s ${quoted}`], { encoding: 'utf8' });
  assert.equal(out, msg);
});
