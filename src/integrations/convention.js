'use strict';

const { DEFAULT_TYPES } = require('../conventional');

/**
 * The single source of truth for the commit-message guidance quietcommit
 * ships into agent instruction files (AGENTS.md, Cursor rules, Copilot
 * instructions, the Claude Code skill). Markdown body only — callers wrap
 * it with whatever marker / frontmatter their target format needs.
 */
function conventionMarkdown(config) {
  const types = ((config && config.allowedTypes) || DEFAULT_TYPES).join(', ');
  return `## Commit messages

Format every commit as [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

\`\`\`
<type>(<scope>): <title>

<body>

Refs: <ticket-id>
\`\`\`

- \`type\`: one of ${types}.
- \`scope\`: the affected module/area, inferred from changed paths. Optional.
- \`title\`: imperative mood ("add", not "added"/"adds"), no trailing period, under 72 characters total.
- \`body\`: for anything non-trivial, 1-4 sentences on what changed and why — only state a "why" that's
  actually evidenced by the diff or the task you were given, never invent a rationale.
- \`Refs\`: the ticket ID from the branch name, if there is one, as a footer (not in the title).

Write the message yourself using your task context — you have more context than any tool inspecting
the diff alone. This repo has quietcommit installed, which will validate (and if needed, redirect)
non-conforming commits, but writing it right the first time avoids the retry.`;
}

module.exports = { conventionMarkdown };
