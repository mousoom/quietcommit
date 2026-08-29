'use strict';

const fs = require('node:fs');
const path = require('node:path');
const git = require('../git');
const draft = require('../draft');
const quality = require('../quality');

// git-authored message sources we should never touch — these already carry
// meaning we didn't put there (a merge summary, a squash list, an amend of
// an existing commit's own message).
const PROTECTED_SOURCES = new Set(['merge', 'squash', 'commit']);

function statePath(cwd) {
  return path.join(git.gitDir(cwd), 'QUIETCOMMIT_STATE.json');
}

function writeState(cwd, state) {
  try {
    fs.writeFileSync(statePath(cwd), JSON.stringify(state), 'utf8');
  } catch {
    // best-effort — a failure here just means commit-msg falls back to
    // treating the commit as interactive, never blocking.
  }
}

function readState(cwd) {
  try {
    return JSON.parse(fs.readFileSync(statePath(cwd), 'utf8'));
  } catch {
    return null;
  }
}

function clearState(cwd) {
  try {
    fs.unlinkSync(statePath(cwd));
  } catch {
    // no-op
  }
}

/**
 * prepare-commit-msg: git calls this with (msgFile, source, sha) before the
 * message is finalized. This is where the silent default flow lives — if
 * the message that's about to land is empty or low-quality, replace it with
 * a drafted one. Never blocks: exit status is always 0 here, by design (see
 * PRD section 7) — commit-msg is where blocking, if configured, happens.
 */
async function runPrepareCommitMsg({ msgFile, source, cwd, config }) {
  if (PROTECTED_SOURCES.has(source)) {
    return { skipped: true, reason: `source=${source}` };
  }

  let files;
  try {
    files = git.stagedFiles(cwd);
  } catch {
    return { skipped: true, reason: 'could not read staged files' };
  }
  if (files.length === 0) {
    return { skipped: true, reason: 'nothing staged' };
  }

  const currentMessage = fs.existsSync(msgFile) ? fs.readFileSync(msgFile, 'utf8') : '';
  const diffStats = quality.diffStatsFromFiles(files);
  const check = quality.checkQuality(currentMessage, { config, diffStats });

  const nonInteractive = source === 'message'; // git invoked with -m/-F

  if (check.valid) {
    writeState(cwd, { source, rewrote: false });
    return { skipped: true, reason: 'existing message already passes the quality bar' };
  }

  if (config.requireApproval && nonInteractive) {
    // Approval mode + no live human in the loop: don't silently rewrite.
    // Leave the message as given; commit-msg will validate and block,
    // surfacing a drafted suggestion the caller can retry with.
    let suggestion = null;
    try {
      const draftResult = await draft.draft({ cwd, config });
      suggestion = draft.draftToMessage(draftResult);
    } catch {
      // drafting can legitimately fail (e.g. nothing staged edge case) —
      // commit-msg will still block, just without a ready-made suggestion.
    }
    writeState(cwd, { source, rewrote: false, suggestion });
    return { skipped: true, reason: 'approval mode — deferring to commit-msg' };
  }

  // Silent default path (and the interactive-editor path, where pre-filling
  // the editor with a good draft *is* the UX — the human's normal
  // review-and-save remains available whether or not approval is required).
  const draftResult = await draft.draft({ cwd, config });
  const newMessage = draft.draftToMessage(draftResult);
  fs.writeFileSync(msgFile, `${newMessage}\n`, 'utf8');
  writeState(cwd, { source, rewrote: true, draftSource: draftResult.source });
  return { rewrote: true, message: newMessage, draftSource: draftResult.source };
}

/**
 * commit-msg: git calls this with (msgFile) after the message is finalized,
 * as the last checkpoint before the commit object is written. This is the
 * only place quietcommit ever blocks a commit, and only when the user has
 * opted into requireApproval AND no live human was present to approve via
 * the editor (i.e. a non-interactive commit: -m, or an agent).
 */
async function runCommitMsg({ msgFile, cwd, config }) {
  const state = readState(cwd);
  clearState(cwd);

  if (!config.requireApproval) {
    return { blocked: false };
  }

  const source = state && state.source;
  const nonInteractive = source === 'message';
  if (!nonInteractive) {
    // Interactive commit: the human's editor save (or abort) already was
    // the approval step. Nothing left to enforce here.
    return { blocked: false };
  }

  const message = fs.existsSync(msgFile) ? fs.readFileSync(msgFile, 'utf8') : '';
  let files = [];
  try {
    files = git.stagedFiles(cwd);
  } catch {
    // fall through with an empty file list — quality check still runs
  }
  const diffStats = quality.diffStatsFromFiles(files);
  const check = quality.checkQuality(message, { config, diffStats });

  if (check.valid) {
    return { blocked: false };
  }

  return {
    blocked: true,
    errors: check.errors,
    warnings: check.warnings,
    suggestion: (state && state.suggestion) || null,
  };
}

module.exports = { runPrepareCommitMsg, runCommitMsg, statePath };
