# quietcommit

[![ci](https://github.com/mousoom/quietcommit/actions/workflows/ci.yml/badge.svg)](https://github.com/mousoom/quietcommit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/quietcommit.svg)](https://www.npmjs.com/package/quietcommit)
[![node](https://img.shields.io/node/v/quietcommit.svg)](https://www.npmjs.com/package/quietcommit)
[![license](https://img.shields.io/npm/l/quietcommit.svg)](LICENSE)

Writes properly-formatted, detailed commit messages automatically — for AI coding agents and humans,
with no required approval and no API key for the common case.

Install it once, in a repo, and every commit that lands there — whether typed by a human, run by
Claude Code, or run by any other agent — gets a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
message, without anyone having to remember to ask for one.

```
feat(auth): add password reset flow

Adds a new endpoint and email template for password reset requests.

Refs: ENG-1234
```

## Why

Commit history is supposed to be a record you can trust later. In practice it usually isn't:
humans under time pressure write `wip`/`fix`, and AI agents write commits nobody reviews — the
agent has no stake in a message it'll never be confused by, and increasingly nobody's watching to
catch it. quietcommit raises the floor on every commit with zero required interaction, rather than
inserting an approval checkpoint that doesn't fit how people already work with agents.

## What actually happens on every commit (read this before installing)

quietcommit intercepts commits through git's own hook chain — `prepare-commit-msg` and
`commit-msg` — so it works no matter how the commit was made. On each commit:

1. If the message already given (via `-m`, or typed into an editor) is a well-formed, reasonably
   descriptive Conventional Commits message, **it's left alone.**
2. If it's missing, empty, or low-signal (`wip`, `fix`, `update`, no structure at all), quietcommit
   drafts a replacement:
   - **An AI agent is doing the committing** (Claude Code, or another agent following the
     `AGENTS.md` convention): the agent is asked — via a hook, or via `AGENTS.md` — to write the
     message itself, using the context of the task it just did. Nothing your diff or repo content
     leaves your machine to reach quietcommit itself; the agent already had that context and is
     just being asked to structure it. **No separate API key, no extra billing** — it rides
     whatever session/subscription is already running the agent.
   - **No agent is present** (a human typing `git commit` in a bare terminal): quietcommit falls
     back to a rule-based formatter — infers `type` from an explicit branch prefix (`feat/…`,
     `fix/…`) or, failing that, which files changed; `scope` from the changed directory; and a
     ticket ID from the branch name (project keys `ENG-1234`, or bare issue numbers `1234`).
     **No AI, no key, no network call**,
     and honestly, no drafted body — just structure. If you want an AI-drafted body here too, you
     have to opt in explicitly (see `headlessBackend` below) — either your own API key, sent to
     that provider's API and nowhere else, or a local Ollama model that never leaves your machine.
3. The message is written back into the commit before it's finalized. No prompt, no pause, unless
   you've turned on `requireApproval` (see below).

Nothing here reads or transmits anything beyond the staged diff of the commit being made, and only
to the AI surface that's already in use for that commit (your own agent session, or, only if you
opt in, the backend you configured). quietcommit itself never holds an API key or bills you for
anything.

## Install

```sh
npm install -g quietcommit      # or add as a devDependency and let npx resolve it

cd your-repo
quietcommit install             # hooks for this repo only
quietcommit install --claude-code   # + Claude Code PreToolUse hook + /quietcommit skill
quietcommit install --agents-md     # + write/update AGENTS.md for other agents
quietcommit install --cursor        # + write/update .cursor/rules/quietcommit.mdc
quietcommit install --copilot       # + write/update .github/copilot-instructions.md
quietcommit install --all           # hooks + every agent integration above

quietcommit install --global    # hooks for every repo on this machine (core.hooksPath)
```

`quietcommit uninstall` (with the same flags) removes exactly what was installed and restores any
hook that was already there before — nothing is left half-configured. Every agent-instruction file
is edited through a marked `<!-- quietcommit:begin -->` … `<!-- quietcommit:end -->` block, so
hand-written content in the same file is never touched.

## Use it directly

Staged changes, no hook installed (or you just want to invoke it explicitly):

```sh
git add .
quietcommit              # drafts a message and commits, same as the silent hook flow
quietcommit --dry-run    # print the draft without committing
quietcommit --review     # show the draft, then accept / edit / regenerate / abort
```

`quietcommit status` prints what's installed in the current repo (git hooks, Claude Code hook and
`/quietcommit` skill, `AGENTS.md` / Cursor / Copilot blocks), the effective config and which file
each value came from, and whether either environment override below is active.

See [`examples/`](examples/) for real staged diffs and the messages quietcommit drafts for them.

## How each platform gets the benefit

- **Claude Code** (native, v1's flagship integration): a `PreToolUse` hook intercepts a raw
  `git commit` before it runs, and if the message doesn't meet the bar, denies it with the reason
  and a ready-to-use suggested command — Claude retries in the same turn, so it's still invisible
  to you. Config: `.claude/settings.json` + `.claude/hooks/quietcommit-pretooluse.sh`. A
  `.claude/skills/quietcommit/SKILL.md` is also installed so an agent can invoke drafting
  deliberately (`/quietcommit`), not only react to the gate.
- **Cursor / GitHub Copilot**: a marked block in `.cursor/rules/quietcommit.mdc` (always-applied)
  or `.github/copilot-instructions.md` carries the same convention as an always-on instruction.
- **Everything else** (Codex, Aider, OpenCode, and 20+ others per the
  [agents.md](https://agents.md) spec): an `AGENTS.md` block tells the agent the convention to
  follow. Less enforced than the Claude Code hook (it's an instruction, not a gate), but universal.
- **A human, anywhere**: the git hooks apply regardless of what wrote the message.

An MCP server (`draft_commit`/`create_commit` tools, plus a cleaner approval UX via the host's own
permission dialog) is planned but deliberately out of v1 — see the PRD.

## Configuration

`.quietcommitrc.json` in the repo root (or `~/.quietcommitrc.json` globally; repo overrides global).
Zero config needed to get the default behavior:

```jsonc
{
  "requireApproval": false,   // true adds a checkpoint — see below
  "allowedTypes": ["feat","fix","refactor","perf","docs","test","chore","build","ci","style","revert"],
  "ticketPattern": null,      // override the default TICKET-NUMBER branch regex if yours differs
  "headlessBackend": null     // opt-in only — e.g. {"provider":"anthropic","apiKey":"..."} or {"provider":"ollama","host":"http://localhost:11434","model":"llama3"}
}
```

`quietcommit config` prints the effective merged config. `quietcommit config --init` writes a
starter file.

### Environment overrides

Two env vars change behavior without editing any rc file — handy for CI, scripts, or a one-off
commit:

- `QUIETCOMMIT_DISABLE=1` — every git hook becomes a transparent no-op; commits behave exactly as
  if quietcommit weren't installed. Explicit `quietcommit` subcommands still work. (Unlike
  `git commit --no-verify`, this doesn't also skip every *other* hook in the repo.)
- `QUIETCOMMIT_STRICT=1` — forces `requireApproval` on for this invocation, regardless of config.

Accepted truthy values: `1`, `true`, `yes`, `on` (case-insensitive).

### Approval mode (`requireApproval: true`)

Off by default — the whole point of this tool is not adding a checkpoint nobody asked for. If you
turn it on:

- **Interactive commit** (you ran `git commit` with no `-m`, an editor opens): the draft is
  pre-filled. Your normal review-and-save *is* the approval; aborting the editor aborts the commit,
  exactly like today.
- **Non-interactive commit** (`-m`, or an agent): there's no live human in the moment, so instead
  quietcommit validates the message and **blocks the commit** (exit 1) if it fails the bar, printing
  the specific problems and a ready-made suggested replacement. Retry with a better message, or
  `git commit --no-verify` to bypass like any git hook.

## Commit message format

[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <title>

<body>

Refs: <ticket-id>
BREAKING CHANGE: <description>   (only if applicable)
```

## What v1 doesn't do (yet)

Diff-content hygiene (secret scanning), deep per-repo config, team/manager analytics, rewriting
existing history, and adapters for platforms beyond Claude Code + the universal `AGENTS.md`
convention are all deliberately out of scope for v1 — see the PRD for the reasoning. Real feedback
from real usage, not a feature checklist, decides what v2 covers.

## License

MIT
