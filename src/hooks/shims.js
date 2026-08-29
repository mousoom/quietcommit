'use strict';

const { REPO_URL } = require('../meta');

// The marker line lets install/uninstall recognize a hook file as one we
// manage, so re-running install is idempotent and uninstall can tell a
// quietcommit shim apart from someone else's hook.
const MARKER = '# quietcommit-managed-hook';

function resolveRunnerLine() {
  // Prefer a globally-installed `quietcommit` on PATH; fall back to npx so
  // the hook still works in a repo where it's only a local devDependency.
  return (
    'if command -v quietcommit >/dev/null 2>&1; then\n' +
    '  QC="quietcommit"\n' +
    'elif [ -x "$(git rev-parse --show-toplevel 2>/dev/null)/node_modules/.bin/quietcommit" ]; then\n' +
    '  QC="$(git rev-parse --show-toplevel)/node_modules/.bin/quietcommit"\n' +
    'else\n' +
    '  QC="npx --yes quietcommit"\n' +
    'fi'
  );
}

function chainOriginalBlock(hookName) {
  // If we backed up a pre-existing hook at install time, run it first and
  // respect its exit code — we never want to silently swallow someone
  // else's hook (a pre-commit linter, a signing check, etc).
  return (
    `ORIGINAL="$(dirname "$0")/${hookName}.quietcommit-original"\n` +
    'if [ -x "$ORIGINAL" ]; then\n' +
    '  "$ORIGINAL" "$@" || exit $?\n' +
    'fi'
  );
}

function prepareCommitMsgShim() {
  return `#!/bin/sh
${MARKER}
# Installed by quietcommit — ${REPO_URL}
# Do not edit by hand; run \`quietcommit uninstall\` to remove.

${chainOriginalBlock('prepare-commit-msg')}

${resolveRunnerLine()}
exec "$QC" hook-run prepare-commit-msg "$1" "$2" "$3"
`;
}

function commitMsgShim() {
  return `#!/bin/sh
${MARKER}
# Installed by quietcommit — ${REPO_URL}
# Do not edit by hand; run \`quietcommit uninstall\` to remove.

${chainOriginalBlock('commit-msg')}

${resolveRunnerLine()}
exec "$QC" hook-run commit-msg "$1"
`;
}

const SHIMS = {
  'prepare-commit-msg': prepareCommitMsgShim,
  'commit-msg': commitMsgShim,
};

module.exports = { SHIMS, MARKER };
