# Security Policy

## Supported versions

quietcommit is pre-1.0. Only the latest published version on npm receives security fixes.

## Reporting a vulnerability

Report privately via GitHub Security Advisories
(<https://github.com/mousoom/quietcommit/security/advisories/new>), or by email to
mousoom.personal@gmail.com. Please do not open a public issue for a suspected vulnerability.

Expect an acknowledgement within a few days. There is no bug-bounty program.

## What quietcommit touches

quietcommit is a local developer tool. It runs as part of your `git commit` flow and, under Claude
Code, as a `PreToolUse` hook.

- **It shells out to `git`** via `spawnSync('git', [args])` — an argument array, never a shell
  string — so commit content and file names cannot be interpreted as shell syntax.
- **The Claude Code deny suggestion** (`git commit -m '…'`) is single-quote wrapped, so a drafted
  title derived from a file name containing backticks or `$()` cannot become a command substitution
  if pasted into a shell.
- **Git hooks fail open.** `prepare-commit-msg` never blocks a commit; an internal error there is a
  warning, not a failure. The Claude Code hook likewise exits 0 (allow) on any parse or runtime
  error. The message-quality checks are a nudge, not a security boundary — `git commit --no-verify`
  and `QUIETCOMMIT_DISABLE=1` both bypass them by design.

## Data handling

- The default (rule-based) path reads only the staged file list and the branch name. **No network
  call, no data leaves the machine.**
- The staged diff is read only when you have opted into `headlessBackend`, and is sent only to the
  provider you configured (`anthropic` → `api.anthropic.com`, or `ollama` → your configured host).
- When an AI agent is doing the commit, quietcommit asks *that agent* to write the message. Nothing
  is sent to quietcommit; the agent already had the context.

## API keys

`headlessBackend.apiKey` in `.quietcommitrc.json` is stored in plaintext. Prefer setting
`ANTHROPIC_API_KEY` in your environment instead — `config --init` never writes a key. If you do put
a key in the rc file, keep that file out of version control.
