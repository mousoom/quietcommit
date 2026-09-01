# quietcommit

[![ci](https://github.com/mousoom/quietcommit/actions/workflows/ci.yml/badge.svg)](https://github.com/mousoom/quietcommit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/quietcommit.svg)](https://www.npmjs.com/package/quietcommit)
[![node](https://img.shields.io/node/v/quietcommit.svg)](https://www.npmjs.com/package/quietcommit)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Every commit in a repo gets a proper [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
message — whether a human, Claude Code, or any other agent made it. No approval step, no API key
for the common case, nothing to remember.

```sh
git commit -m "wip"
```

```
feat(auth): add password reset flow

Adds a new endpoint and email template for password reset requests.

Refs: ENG-1234
```

## Quickstart

```sh
npm install -g quietcommit    # or add as a devDependency

cd your-repo
quietcommit install           # git hooks for this repo
quietcommit install --all     # + every agent integration below
```

`install` always sets up the git hooks. Add integrations on top — individually or combined
(`--claude-code --cursor`):

```sh
quietcommit install --claude-code   # PreToolUse gate before `git commit` runs + /quietcommit skill
quietcommit install --agents-md     # AGENTS.md block — Codex, Aider, OpenCode, 20+ others
quietcommit install --cursor        # .cursor/rules/quietcommit.mdc
quietcommit install --copilot       # .github/copilot-instructions.md

quietcommit install --global        # git hooks for every repo on this machine (core.hooksPath)
```

Working in someone else's / a company repo and don't want the integration files in a shared
branch? Add `--local-only` — it lists them in `.git/info/exclude` (per-clone, never pushed, and
your team's `.gitignore` is untouched):

```sh
quietcommit install --claude-code --local-only
```

The git hooks live in `.git/` and can never be committed regardless.

That's it. Commits are handled silently from now on. `quietcommit uninstall` (same flags) removes
exactly what was installed and restores any hook that was there before.

## How it works

quietcommit runs inside git's own `prepare-commit-msg` / `commit-msg` hooks, so it catches every
commit regardless of what made it.

- **Message already good** → left untouched.
- **An agent is committing** → the agent is asked to write the message from its task context. No
  extra API key, no billing — it rides the session already running the agent.
- **No agent, bare terminal** → a rule-based formatter infers `type` / `scope` / ticket from the
  branch and changed files. No AI, no network, no drafted body — just structure.

Silent by default. No prompt, no pause. Turn on `requireApproval` if you want a checkpoint — see
[docs/configuration.md](docs/configuration.md).

Full walkthrough, what it never touches, fail-open semantics, and data handling:
[docs/behavior.md](docs/behavior.md).

## Use it directly

```sh
git add .
quietcommit              # draft a message and commit
quietcommit --dry-run    # print the draft, don't commit
quietcommit --review     # draft, then accept / edit / regenerate / abort
quietcommit status       # what's installed here + the effective config
```

See [`examples/`](examples/) for real staged diffs and the messages quietcommit drafts for them.

## Per-platform integration

- **Claude Code** — a `PreToolUse` hook catches a raw `git commit` before it runs and, if the
  message misses the bar, denies it with a ready-to-use suggestion; Claude retries in the same
  turn. Also installs a `/quietcommit` skill.
- **Cursor / GitHub Copilot** — a marked block in `.cursor/rules/quietcommit.mdc` or
  `.github/copilot-instructions.md` carries the convention as an always-on instruction.
- **Codex, Aider, OpenCode, others** — an `AGENTS.md` block per the
  [agents.md](https://agents.md) spec. An instruction, not a gate, but universal.
- **A human, anywhere** — the git hooks apply no matter what wrote the message.

An MCP server (`draft_commit` / `create_commit`) is planned but deliberately out of v1.

## Configuration

Zero config for the default. See [docs/configuration.md](docs/configuration.md) for the
`.quietcommitrc.json` schema, the `QUIETCOMMIT_DISABLE` / `QUIETCOMMIT_STRICT` env vars, approval
mode, and the opt-in `headlessBackend` (your own API key or a local Ollama model).

## Commit message format

[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <title>

<body>

Refs: <ticket-id>
BREAKING CHANGE: <description>   (only if applicable)
```

## What v1 doesn't do (yet)

Secret scanning, deep per-repo config, team analytics, rewriting existing history, and adapters
beyond Claude Code + `AGENTS.md` are deliberately out of scope for v1. Real feedback from real
usage decides what v2 covers.

## Prior art

- **[better-commits](https://github.com/everduin94/better-commits)** — an interactive TUI commit
  builder. quietcommit's branch-name inference is modelled on its approach. Want to be prompted
  through each field instead of a silent hook? Use better-commits.
- **[graphify](https://github.com/Graphify-Labs/graphify)** — a different tool, but its
  three-surface install model (git hooks / instruction files / MCP) and its `status` subcommand
  shaped how quietcommit installs and reports itself.

## Contributing

Bug reports and focused PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and
conventions. All participation is under the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues:
[SECURITY.md](SECURITY.md) — report privately, not as a public issue.

## License

MIT
