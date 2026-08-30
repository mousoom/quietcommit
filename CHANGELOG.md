# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-08-30

### Fixed

- Claude Code gate: `git -c key=val commit …` and other global `-c` / `-C` options before
  `commit` no longer bypass the `PreToolUse` check.
- Claude Code gate: `-mMSG` (value glued to the flag) and `-m=MSG` are now recognised, so a valid
  commit is no longer denied as "needs a -m message".
- `prepare-commit-msg` no longer overwrites boilerplate from a user's `commit.template`
  (`template` added to the protected message sources).
- Opt-in AI drafting tolerates a model response wrapped in ```` ```json ```` fences or padded with
  prose instead of falling back to the rule-based draft.
- Default `headlessBackend` Anthropic model updated to `claude-haiku-4-5`.

## [0.1.0] - 2026-08-30

Initial release.

### Added

- **Git hook layer** — `prepare-commit-msg` (silent draft/rewrite of empty or low-signal messages;
  never blocks) and `commit-msg` (the only place a commit is blocked, and only under
  `requireApproval` for non-interactive commits). Shims chain onto any pre-existing hook and are
  restored on uninstall. Per-repo install, or `--global` via `core.hooksPath`.
- **Conventional Commits v1.0.0 parser/formatter** — header grammar, 72-char cap, `Refs:` and
  `BREAKING CHANGE:` / `!` handling.
- **Rule-based drafting** — no AI, no key, no network. Infers `type` from an explicit branch prefix
  (`feat/…`, `fix/…`) or the changed file paths, `scope` from the shared top-level directory, and a
  ticket id from the branch name: project keys (`ENG-1234`), lowercase keys, underscore separators,
  and bare numeric issue ids (`1487`, `feature/1487-…`), tried in priority order.
- **Opt-in AI drafting** (`headlessBackend`) — Anthropic API or a local Ollama model draft a body
  from the staged diff. Falls back to the rule-based draft on any failure.
- **Claude Code integration** — a `PreToolUse` hook denies a raw `git commit` whose message misses
  the bar, with a ready-to-paste, shell-safe suggested command. Also installs a
  `.claude/skills/quietcommit/SKILL.md` so an agent can invoke drafting deliberately
  (`/quietcommit`).
- **Agent instruction files** — marked, idempotent, append-safe blocks in `AGENTS.md`
  (`--agents-md`), `.cursor/rules/quietcommit.mdc` (`--cursor`), and
  `.github/copilot-instructions.md` (`--copilot`). `--all` installs every integration. Hand-written
  content in the same file is never touched.
- **`quietcommit` (standalone)** — draft + commit staged changes; `--dry-run`, `--review`.
- **`quietcommit status`** — reports installed hooks (and whether they chain a pre-existing hook),
  the Claude Code hook + skill, the `AGENTS.md` / Cursor / Copilot blocks, the effective config and
  which file each value came from, and any active environment override.
- **`quietcommit config`** / `config --init` — print the effective merged config, or write a
  starter `.quietcommitrc.json`.
- **Environment overrides** — `QUIETCOMMIT_DISABLE=1` turns every hook into a transparent no-op;
  `QUIETCOMMIT_STRICT=1` forces `requireApproval` on. Both without editing any rc file.
- Linked-worktree support: the hooks directory is resolved via `git rev-parse --git-path hooks`, so
  installs land where git actually executes hooks from.

[Unreleased]: https://github.com/mousoom/quietcommit/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/mousoom/quietcommit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mousoom/quietcommit/releases/tag/v0.1.0
