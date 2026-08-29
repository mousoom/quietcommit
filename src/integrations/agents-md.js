'use strict';

const path = require('node:path');
const { conventionMarkdown } = require('./convention');
const { installMarkerBlock, uninstallMarkerBlock, markerBlockStatus } = require('./marker-block');

const BEGIN_MARKER = '<!-- quietcommit:begin -->';
const END_MARKER = '<!-- quietcommit:end -->';

function spec(repoRoot, config) {
  return {
    filePath: path.join(repoRoot, 'AGENTS.md'),
    beginMarker: BEGIN_MARKER,
    endMarker: END_MARKER,
    body: conventionMarkdown(config),
    preamble: '# Agent instructions\n\n',
    emptyEquivalents: ['# Agent instructions'],
  };
}

/**
 * Write or update a quietcommit-owned block inside AGENTS.md, leaving the
 * rest of the file (and any content a human or another tool put there)
 * untouched.
 */
function installAgentsMd(repoRoot, config) {
  return installMarkerBlock(spec(repoRoot, config));
}

function uninstallAgentsMd(repoRoot) {
  return uninstallMarkerBlock(spec(repoRoot));
}

/**
 * Read-only check for `quietcommit status`: is a quietcommit-owned block
 * currently present in AGENTS.md?
 */
function agentsMdStatus(repoRoot) {
  return markerBlockStatus(spec(repoRoot));
}

module.exports = { installAgentsMd, uninstallAgentsMd, agentsMdStatus, BEGIN_MARKER, END_MARKER };
