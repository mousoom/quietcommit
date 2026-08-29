'use strict';

const path = require('node:path');
const { conventionMarkdown } = require('./convention');
const { installMarkerBlock, uninstallMarkerBlock, markerBlockStatus } = require('./marker-block');

const BEGIN_MARKER = '<!-- quietcommit:begin -->';
const END_MARKER = '<!-- quietcommit:end -->';

// --- Cursor: .cursor/rules/quietcommit.mdc ----------------------------

const CURSOR_FRONTMATTER =
  '---\n' +
  'description: Commit message convention (enforced by quietcommit)\n' +
  'alwaysApply: true\n' +
  '---\n';

function cursorSpec(repoRoot, config) {
  return {
    filePath: path.join(repoRoot, '.cursor', 'rules', 'quietcommit.mdc'),
    beginMarker: BEGIN_MARKER,
    endMarker: END_MARKER,
    body: conventionMarkdown(config),
    preamble: CURSOR_FRONTMATTER + '\n',
    // If uninstall leaves only the frontmatter, drop the whole file.
    emptyEquivalents: [CURSOR_FRONTMATTER.trim()],
  };
}

function installCursor(repoRoot, config) {
  return installMarkerBlock(cursorSpec(repoRoot, config));
}
function uninstallCursor(repoRoot) {
  return uninstallMarkerBlock(cursorSpec(repoRoot));
}
function cursorStatus(repoRoot) {
  return markerBlockStatus(cursorSpec(repoRoot));
}

// --- GitHub Copilot: .github/copilot-instructions.md -----------------

const COPILOT_PREAMBLE = '# Copilot instructions\n\n';

function copilotSpec(repoRoot, config) {
  return {
    filePath: path.join(repoRoot, '.github', 'copilot-instructions.md'),
    beginMarker: BEGIN_MARKER,
    endMarker: END_MARKER,
    body: conventionMarkdown(config),
    preamble: COPILOT_PREAMBLE,
    emptyEquivalents: [COPILOT_PREAMBLE.trim()],
  };
}

function installCopilot(repoRoot, config) {
  return installMarkerBlock(copilotSpec(repoRoot, config));
}
function uninstallCopilot(repoRoot) {
  return uninstallMarkerBlock(copilotSpec(repoRoot));
}
function copilotStatus(repoRoot) {
  return markerBlockStatus(copilotSpec(repoRoot));
}

module.exports = {
  installCursor, uninstallCursor, cursorStatus,
  installCopilot, uninstallCopilot, copilotStatus,
};
