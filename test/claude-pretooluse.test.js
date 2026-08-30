'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  shellSingleQuote,
  extractMessage,
  GIT_COMMIT_RE,
} = require('../src/hooks/claude-pretooluse');

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

test('GIT_COMMIT_RE matches commits behind global -c / -C / -- options', () => {
  assert.ok(GIT_COMMIT_RE.test('git commit -m "x"'));
  assert.ok(GIT_COMMIT_RE.test('git -C /repo commit -m "x"'));
  assert.ok(GIT_COMMIT_RE.test('git -c user.name=x commit -m "x"'));
  assert.ok(GIT_COMMIT_RE.test('git -c a=b -C /r --no-pager commit -m "x"'));
  assert.ok(!GIT_COMMIT_RE.test('git status'));
  assert.ok(!GIT_COMMIT_RE.test('git log --format=commit'));
});

test('extractMessage handles glued and = forms of -m/--message', () => {
  assert.equal(extractMessage('git commit -m "feat: x"'), 'feat: x');
  assert.equal(extractMessage('git commit -mwip'), 'wip');
  assert.equal(extractMessage('git commit -m=wip'), 'wip');
  assert.equal(extractMessage("git commit -m 'feat: y'"), 'feat: y');
  assert.equal(extractMessage('git commit --message="feat: z"'), 'feat: z');
  assert.equal(extractMessage('git commit --message body'), 'body');
  assert.equal(
    extractMessage('git commit -m "feat: a" -m "more detail"'),
    'feat: a\n\nmore detail'
  );
  assert.equal(extractMessage('git commit'), null);
});
