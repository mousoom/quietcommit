'use strict';

/**
 * Parse and assemble Conventional Commits v1.0.0 messages.
 * https://www.conventionalcommits.org/en/v1.0.0/
 *
 *   <type>(<scope>)!: <title>
 *
 *   <body>
 *
 *   Refs: <ticket-id>
 *   BREAKING CHANGE: <description>
 */

const DEFAULT_TYPES = [
  'feat', 'fix', 'refactor', 'perf', 'docs', 'test',
  'chore', 'build', 'ci', 'style', 'revert',
];

const TITLE_MAX_LEN = 72;

// type(scope)!: subject   — scope and ! both optional
const HEADER_RE = /^([a-zA-Z]+)(\(([^)]+)\))?(!)?:\s*(.+)$/;

/**
 * Parse a raw commit message string into structured fields.
 * Returns { type, scope, breaking, title, body, refs, breakingDescription, raw, valid, errors }
 */
function parse(message, { allowedTypes = DEFAULT_TYPES } = {}) {
  const errors = [];
  const raw = message == null ? '' : message;

  // Strip comment lines (git leaves `#`-prefixed lines in COMMIT_EDITMSG).
  const lines = raw.split('\n').filter((l) => !l.startsWith('#'));
  // Trim trailing blank lines.
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

  if (lines.length === 0 || lines[0].trim() === '') {
    return {
      type: null, scope: null, breaking: false, title: '', body: '',
      refs: null, breakingDescription: null, raw, valid: false,
      errors: ['empty commit message'],
    };
  }

  const headerLine = lines[0];
  const match = HEADER_RE.exec(headerLine.trim());

  let type = null, scope = null, breaking = false, title = headerLine.trim();

  if (match) {
    type = match[1].toLowerCase();
    scope = match[3] || null;
    breaking = Boolean(match[4]);
    title = match[5].trim();
  } else {
    errors.push('header does not match "type(scope): title" format');
  }

  if (match && !allowedTypes.includes(type)) {
    errors.push(`type "${type}" is not one of the allowed types (${allowedTypes.join(', ')})`);
  }

  if (title.endsWith('.')) {
    errors.push('title should not end with a period');
  }

  if (headerLine.length > TITLE_MAX_LEN) {
    errors.push(`header is ${headerLine.length} chars, over the ${TITLE_MAX_LEN}-char cap`);
  }

  if (/^[a-z]/.test(title) === false && /^[A-Z][a-z]/.test(title)) {
    // Not a hard error — imperative mood can't be reliably checked by regex —
    // but capitalized-after-colon is a common style smell worth flagging softly.
  }

  // Body is everything between the header and any trailing footers, joined
  // by blank lines per the spec.
  const rest = lines.slice(1);
  // Drop a single leading blank line separating header from body.
  if (rest[0] === '') rest.shift();

  let refs = null;
  let breakingDescription = null;
  const bodyLines = [];

  for (const line of rest) {
    const refsMatch = /^Refs:\s*(.+)$/i.exec(line);
    const breakingMatch = /^BREAKING[ -]CHANGE:\s*(.+)$/i.exec(line);
    if (refsMatch) {
      refs = refsMatch[1].trim();
    } else if (breakingMatch) {
      breakingDescription = breakingMatch[1].trim();
      breaking = true;
    } else {
      bodyLines.push(line);
    }
  }

  // Trim leading/trailing blank lines from the body.
  while (bodyLines.length && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

  return {
    type,
    scope,
    breaking,
    title,
    body: bodyLines.join('\n'),
    refs,
    breakingDescription,
    raw,
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Assemble structured fields back into a Conventional Commits message string.
 */
function format({ type, scope, breaking = false, title, body, refs, breakingDescription }) {
  if (!type) throw new Error('format() requires a type');
  if (!title) throw new Error('format() requires a title');

  const scopePart = scope ? `(${scope})` : '';
  const bangPart = breaking ? '!' : '';
  const header = `${type}${scopePart}${bangPart}: ${title}`;

  const parts = [header];

  if (body && body.trim()) {
    parts.push('', body.trim());
  }

  const footers = [];
  if (refs) footers.push(`Refs: ${refs}`);
  if (breaking && breakingDescription) {
    footers.push(`BREAKING CHANGE: ${breakingDescription}`);
  }
  if (footers.length) {
    parts.push('', footers.join('\n'));
  }

  return parts.join('\n');
}

module.exports = { parse, format, DEFAULT_TYPES, TITLE_MAX_LEN, HEADER_RE };
