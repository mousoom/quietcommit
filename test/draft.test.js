'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ruleBasedTitle, parseModelJson } = require('../src/draft');

test('parseModelJson reads bare JSON', () => {
  assert.deepEqual(parseModelJson('{"type":"feat","title":"x"}'), { type: 'feat', title: 'x' });
});

test('parseModelJson strips ```json fences', () => {
  const wrapped = '```json\n{"type":"fix","title":"y"}\n```';
  assert.deepEqual(parseModelJson(wrapped), { type: 'fix', title: 'y' });
});

test('parseModelJson recovers an object from surrounding prose', () => {
  const noisy = 'Here is the commit:\n{"type":"docs","title":"z"}\nHope that helps!';
  assert.deepEqual(parseModelJson(noisy), { type: 'docs', title: 'z' });
});

test('parseModelJson throws a clear error when there is no object', () => {
  assert.throws(() => parseModelJson('sorry, I cannot help'), /not parseable JSON/);
});

test('ruleBasedTitle for a single added file', () => {
  const title = ruleBasedTitle([{ status: 'A', path: 'src/widgets/button.js' }], 'src');
  assert.equal(title, 'add button.js');
});

test('ruleBasedTitle for a single modified file', () => {
  const title = ruleBasedTitle([{ status: 'M', path: 'README.md' }], null);
  assert.equal(title, 'update README.md');
});

test('ruleBasedTitle for multiple files with a shared scope', () => {
  const files = [
    { status: 'M', path: 'src/a.js' },
    { status: 'M', path: 'src/b.js' },
    { status: 'A', path: 'src/c.js' },
  ];
  const title = ruleBasedTitle(files, 'src');
  assert.equal(title, 'update 3 files in src');
});

test('ruleBasedTitle for multiple files with no shared scope', () => {
  const files = [
    { status: 'D', path: 'a.js' },
    { status: 'D', path: 'b.js' },
  ];
  const title = ruleBasedTitle(files, null);
  assert.equal(title, 'remove 2 files');
});
