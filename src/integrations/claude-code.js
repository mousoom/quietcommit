'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REPO_URL } = require('../meta');

const HOOK_SCRIPT_NAME = 'quietcommit-pretooluse.sh';
const MARKER_COMMAND_FRAGMENT = 'quietcommit-pretooluse';

// Canonical skill file shipped in the package (skills/quietcommit/SKILL.md),
// copied into a project's .claude/skills/ so an agent can invoke drafting
// deliberately (/quietcommit), not only react to the PreToolUse gate.
const SKILL_SRC = path.join(__dirname, '..', '..', 'skills', 'quietcommit', 'SKILL.md');
const SKILL_REL = path.join('.claude', 'skills', 'quietcommit', 'SKILL.md');

function hookScriptContent() {
  return `#!/bin/sh
# Installed by quietcommit — ${REPO_URL}
# Intercepts Bash "git commit" calls before they run (PreToolUse) and
# redirects low-quality messages to a properly-formatted draft.
# Do not edit by hand; run \`quietcommit uninstall --claude-code\` to remove.

if command -v quietcommit >/dev/null 2>&1; then
  QC="quietcommit"
elif [ -x "$(git rev-parse --show-toplevel 2>/dev/null)/node_modules/.bin/quietcommit" ]; then
  QC="$(git rev-parse --show-toplevel)/node_modules/.bin/quietcommit"
else
  QC="npx --yes quietcommit"
fi

exec "$QC" hook-run claude-pretooluse
`;
}

function readSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    throw new Error(`could not parse ${settingsPath}: ${err.message}`);
  }
}

function writeSettings(settingsPath, settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

/**
 * Register quietcommit's PreToolUse hook in .claude/settings.json without
 * clobbering any other hooks already configured there.
 */
function installClaudeCode(repoRoot) {
  const claudeDir = path.join(repoRoot, '.claude');
  const hooksDir = path.join(claudeDir, 'hooks');
  const scriptPath = path.join(hooksDir, HOOK_SCRIPT_NAME);
  const settingsPath = path.join(claudeDir, 'settings.json');

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(scriptPath, hookScriptContent(), 'utf8');
  fs.chmodSync(scriptPath, 0o755);

  const settings = readSettings(settingsPath);
  settings.hooks = settings.hooks || {};
  settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];

  const commandRef = './.claude/hooks/' + HOOK_SCRIPT_NAME;
  const alreadyRegistered = settings.hooks.PreToolUse.some((entry) =>
    (entry.hooks || []).some((h) => (h.command || '').includes(MARKER_COMMAND_FRAGMENT))
  );

  if (!alreadyRegistered) {
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: commandRef }],
    });
  }

  writeSettings(settingsPath, settings);

  let skillPath = null;
  if (fs.existsSync(SKILL_SRC)) {
    skillPath = path.join(repoRoot, SKILL_REL);
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.copyFileSync(SKILL_SRC, skillPath);
  }

  return { scriptPath, settingsPath, skillPath, alreadyRegistered };
}

function uninstallClaudeCode(repoRoot) {
  const claudeDir = path.join(repoRoot, '.claude');
  const scriptPath = path.join(claudeDir, 'hooks', HOOK_SCRIPT_NAME);
  const settingsPath = path.join(claudeDir, 'settings.json');

  let removedFromSettings = false;
  if (fs.existsSync(settingsPath)) {
    const settings = readSettings(settingsPath);
    if (settings.hooks && Array.isArray(settings.hooks.PreToolUse)) {
      const before = settings.hooks.PreToolUse.length;
      settings.hooks.PreToolUse = settings.hooks.PreToolUse
        .map((entry) => ({
          ...entry,
          hooks: (entry.hooks || []).filter((h) => !(h.command || '').includes(MARKER_COMMAND_FRAGMENT)),
        }))
        .filter((entry) => entry.hooks.length > 0);
      removedFromSettings = settings.hooks.PreToolUse.length !== before;
      writeSettings(settingsPath, settings);
    }
  }

  let removedScript = false;
  if (fs.existsSync(scriptPath)) {
    fs.unlinkSync(scriptPath);
    removedScript = true;
  }

  let removedSkill = false;
  const skillPath = path.join(repoRoot, SKILL_REL);
  if (fs.existsSync(skillPath)) {
    fs.unlinkSync(skillPath);
    removedSkill = true;
    // Prune the now-empty skill dirs we created, but stop at .claude.
    for (const dir of [path.dirname(skillPath), path.join(claudeDir, 'skills')]) {
      try {
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      } catch {
        /* not empty or gone — leave it */
      }
    }
  }

  return { removedFromSettings, removedScript, removedSkill };
}

/**
 * Read-only check for `quietcommit status`: is the PreToolUse hook registered
 * in .claude/settings.json, and does the referenced script file still exist?
 */
function claudeCodeStatus(repoRoot) {
  const claudeDir = path.join(repoRoot, '.claude');
  const scriptPath = path.join(claudeDir, 'hooks', HOOK_SCRIPT_NAME);
  const settingsPath = path.join(claudeDir, 'settings.json');

  let registered = false;
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = readSettings(settingsPath);
      const entries = (settings.hooks && settings.hooks.PreToolUse) || [];
      registered = entries.some((entry) =>
        (entry.hooks || []).some((h) => (h.command || '').includes(MARKER_COMMAND_FRAGMENT))
      );
    } catch {
      registered = false;
    }
  }

  const skillPath = path.join(repoRoot, SKILL_REL);
  return {
    registered,
    scriptExists: fs.existsSync(scriptPath),
    skillInstalled: fs.existsSync(skillPath),
    settingsPath,
    scriptPath,
  };
}

module.exports = { installClaudeCode, uninstallClaudeCode, claudeCodeStatus, HOOK_SCRIPT_NAME };
