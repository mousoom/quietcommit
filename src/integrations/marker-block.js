'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Shared install/uninstall/status logic for a quietcommit-owned block
 * delimited by HTML-comment markers inside an otherwise hand-owned Markdown
 * file (AGENTS.md, .cursor/rules/*.mdc, .github/copilot-instructions.md).
 *
 * `spec` shape:
 *   {
 *     filePath,          absolute path to the target file
 *     beginMarker,       e.g. '<!-- quietcommit:begin -->'
 *     endMarker,
 *     body,              the block content BETWEEN the markers (no markers)
 *     preamble,          text written above the block when creating the file fresh
 *                        (e.g. '---\ndescription: ...\n---\n\n# Title\n'); optional
 *     emptyEquivalents,  trimmed strings that mean "file has nothing but our
 *                        preamble left" → delete the file on uninstall; optional
 *   }
 */

function wrap(spec) {
  return `${spec.beginMarker}\n${spec.body}\n${spec.endMarker}`;
}

function installMarkerBlock(spec) {
  const { filePath, beginMarker, endMarker } = spec;
  const newBlock = wrap(spec);

  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${spec.preamble || ''}${newBlock}\n`, 'utf8');
    return { filePath, action: 'created' };
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const beginIdx = existing.indexOf(beginMarker);
  const endIdx = existing.indexOf(endMarker);

  if (beginIdx !== -1 && endIdx !== -1) {
    const updated =
      existing.slice(0, beginIdx) + newBlock + existing.slice(endIdx + endMarker.length);
    if (updated === existing) return { filePath, action: 'unchanged' };
    fs.writeFileSync(filePath, updated, 'utf8');
    return { filePath, action: 'updated' };
  }

  const updated = existing.replace(/\n*$/, '\n\n') + newBlock + '\n';
  fs.writeFileSync(filePath, updated, 'utf8');
  return { filePath, action: 'appended' };
}

function uninstallMarkerBlock(spec) {
  const { filePath, beginMarker, endMarker, emptyEquivalents = [] } = spec;
  if (!fs.existsSync(filePath)) return { filePath, action: 'not present' };

  const existing = fs.readFileSync(filePath, 'utf8');
  const beginIdx = existing.indexOf(beginMarker);
  const endIdx = existing.indexOf(endMarker);
  if (beginIdx === -1 || endIdx === -1) {
    return { filePath, action: 'no quietcommit block found' };
  }

  const stripped = (existing.slice(0, beginIdx) + existing.slice(endIdx + endMarker.length))
    .replace(/\n{3,}/g, '\n\n');

  if (stripped.trim() === '' || emptyEquivalents.includes(stripped.trim())) {
    fs.unlinkSync(filePath);
    return { filePath, action: 'removed (file now empty)' };
  }

  fs.writeFileSync(filePath, stripped, 'utf8');
  return { filePath, action: 'block removed' };
}

function markerBlockStatus(spec) {
  const { filePath, beginMarker, endMarker } = spec;
  if (!fs.existsSync(filePath)) return { present: false, filePath };
  const content = fs.readFileSync(filePath, 'utf8');
  return { present: content.includes(beginMarker) && content.includes(endMarker), filePath };
}

module.exports = { installMarkerBlock, uninstallMarkerBlock, markerBlockStatus };
