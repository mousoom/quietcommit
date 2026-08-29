'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BEGIN_MARKER = '<!-- quietcommit:begin -->';
const END_MARKER = '<!-- quietcommit:end -->';

function block(config) {
  const types = (config && config.allowedTypes) || [
    'feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'chore', 'build', 'ci', 'style', 'revert',
  ];
  return `${BEGIN_MARKER}
## Commit messages

Format every commit as Conventional Commits:

\`\`\`
<type>(<scope>): <title>

<body>

Refs: <ticket-id>
\`\`\`

- \`type\`: one of ${types.join(', ')}.
- \`scope\`: the affected module/area, inferred from changed paths. Optional.
- \`title\`: imperative mood ("add", not "added"/"adds"), no trailing period, under 72 characters total.
- \`body\`: for anything non-trivial, 1-4 sentences on what changed and why — only state a "why" that's
  actually evidenced by the diff or the task you were given, never invent a rationale.
- \`Refs\`: the ticket ID from the branch name, if there is one, as a footer (not in the title).

Write the message yourself using your task context — you have more context than any tool inspecting
the diff alone. This repo has quietcommit installed, which will validate (and if needed, redirect)
non-conforming commits, but writing it right the first time avoids the retry.
${END_MARKER}`;
}

/**
 * Write or update a quietcommit-owned block inside AGENTS.md, leaving the
 * rest of the file (and any content a human or another tool put there)
 * untouched.
 */
function installAgentsMd(repoRoot, config) {
  const filePath = path.join(repoRoot, 'AGENTS.md');
  const newBlock = block(config);

  if (!fs.existsSync(filePath)) {
    const content = `# Agent instructions\n\n${newBlock}\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    return { filePath, action: 'created' };
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  if (beginIdx !== -1 && endIdx !== -1) {
    const updated =
      existing.slice(0, beginIdx) + newBlock + existing.slice(endIdx + END_MARKER.length);
    fs.writeFileSync(filePath, updated, 'utf8');
    return { filePath, action: 'updated' };
  }

  const updated = existing.replace(/\n*$/, '\n\n') + newBlock + '\n';
  fs.writeFileSync(filePath, updated, 'utf8');
  return { filePath, action: 'appended' };
}

function uninstallAgentsMd(repoRoot) {
  const filePath = path.join(repoRoot, 'AGENTS.md');
  if (!fs.existsSync(filePath)) return { filePath, action: 'not present' };

  const existing = fs.readFileSync(filePath, 'utf8');
  const beginIdx = existing.indexOf(BEGIN_MARKER);
  const endIdx = existing.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1) {
    return { filePath, action: 'no quietcommit block found' };
  }

  const updated = existing.slice(0, beginIdx) + existing.slice(endIdx + END_MARKER.length);
  const trimmed = updated.replace(/\n{3,}/g, '\n\n');
  if (trimmed.trim() === '# Agent instructions' || trimmed.trim() === '') {
    fs.unlinkSync(filePath);
    return { filePath, action: 'removed (file now empty)' };
  }
  fs.writeFileSync(filePath, trimmed, 'utf8');
  return { filePath, action: 'block removed' };
}

module.exports = { installAgentsMd, uninstallAgentsMd, BEGIN_MARKER, END_MARKER };
