# How quietcommit handles each commit

quietcommit intercepts commits through git's own hook chain — `prepare-commit-msg` and
`commit-msg` — so it works no matter how the commit was made (a human typing `git commit`, Claude
Code, or any other agent).

## The decision on each commit

1. **The message already given is good** — a well-formed, reasonably descriptive Conventional
   Commits message (via `-m`, or typed into an editor). **It's left alone.**

2. **The message is missing, empty, or low-signal** (`wip`, `fix`, `update`, no structure).
   quietcommit drafts a replacement:

   - **An AI agent is committing** (Claude Code, or an agent following `AGENTS.md`): the agent is
     asked — via a hook or via `AGENTS.md` — to write the message itself from the context of the
     task it just did. Nothing about your diff or repo leaves your machine to reach quietcommit;
     the agent already had that context and is just being asked to structure it. **No separate API
     key, no extra billing** — it rides whatever session/subscription is already running the agent.

   - **No agent is present** (a bare terminal): quietcommit falls back to a rule-based formatter —
     `type` from an explicit branch prefix (`feat/…`, `fix/…`) or, failing that, which files
     changed; `scope` from the changed directory; a ticket id from the branch name (project keys
     like `ENG-1234`, or bare issue numbers like `1234`). **No AI, no key, no network call** — and
     no drafted body, just structure. To get an AI-drafted body here too, opt in with
     `headlessBackend` (see [configuration.md](configuration.md)).

3. **The message is written back** into the commit before it's finalized. No prompt, no pause —
   unless you've turned on `requireApproval` (see [configuration.md](configuration.md)).

## What it never touches

Commits whose message git itself already filled with meaning are left alone regardless of content:

- **merge** commits (the generated merge summary)
- **squash** commits (the combined message list)
- **amend** / reword of an existing commit's own message
- a message from a configured **`commit.template`**

## Fail-open by design

- `prepare-commit-msg` **never blocks a commit.** An internal error there is a warning, not a
  failure — the commit proceeds.
- `commit-msg` is the **only** place quietcommit ever blocks, and only when `requireApproval` is on
  **and** the commit is non-interactive (`-m` or an agent). It then exits 1 with the specific
  problems and a ready-made suggested message.
- The Claude Code `PreToolUse` hook exits 0 (allow) on any parse or runtime error. The
  message-quality check is a nudge, not a security boundary — `git commit --no-verify` and
  `QUIETCOMMIT_DISABLE=1` both bypass it.

## Data handling

Nothing is read or transmitted beyond the staged diff of the commit being made, and only to the AI
surface already in use for that commit:

- Default (rule-based) path: reads only the staged file list and the branch name. **No network
  call. Nothing leaves the machine.**
- `headlessBackend` opted in: the staged diff is sent only to the provider you configured
  (`anthropic` → `api.anthropic.com`, or `ollama` → your host).
- Agent-driven: quietcommit asks the agent to write the message. Nothing is sent to quietcommit.

quietcommit itself never holds an API key or bills you for anything.

## `quietcommit status`

`quietcommit status` reports, for the current repo:

- which git hooks are installed, and whether they chain onto a pre-existing hook
- the Claude Code `PreToolUse` hook and `/quietcommit` skill
- the `AGENTS.md` / Cursor / Copilot instruction blocks
- the effective config and which file each value came from
- whether `QUIETCOMMIT_DISABLE` / `QUIETCOMMIT_STRICT` are active

## The Claude Code gate in detail

When `--claude-code` is installed, a `PreToolUse` hook inspects each `Bash` tool call. If it's a
`git commit` whose message misses the bar, the hook **denies the call** with the reason and a
ready-to-paste, shell-safe suggested command. Claude retries in the same turn, so it stays
invisible to you. It also installs `.claude/skills/quietcommit/SKILL.md` so an agent can invoke
drafting deliberately (`/quietcommit`) rather than only reacting to the gate.

Config lives in `.claude/settings.json` + `.claude/hooks/quietcommit-pretooluse.sh`.
