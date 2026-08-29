---
name: quietcommit
description: Draft and make a well-formed Conventional Commits message for the staged changes in this repo. Use before running `git commit` yourself, or when a commit was rejected for a low-signal / malformed message.
trigger: /quietcommit
---

# /quietcommit

This repo has **quietcommit** installed. Every commit here is expected to be a
[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) message with a real,
diff-evidenced body for anything non-trivial. A git hook (and, under Claude Code, a `PreToolUse`
gate) will redirect commits that don't meet that bar — writing it right the first time avoids the
retry.

## When to use this

- You are about to commit staged work and want the message to pass on the first try.
- A `git commit` you ran was denied with a `quietcommit:` reason.
- Someone asks you to "commit this" / "write a commit message".

Do **not** use it to rewrite existing history or to commit unrelated changes together — stage
deliberately first.

## Steps

1. **Confirm what's staged.** `git diff --cached --stat`. If nothing is staged, stage the intended
   files (`git add …`) — do not commit a partial or accidental set.

2. **Write the message yourself from task context.** You know why the change was made; a tool
   inspecting only the diff does not. Structure:

   ```
   <type>(<scope>): <title>

   <body>

   Refs: <ticket-id>
   BREAKING CHANGE: <description>   (only if applicable)
   ```

   - `type`: feat, fix, refactor, perf, docs, test, chore, build, ci, style, revert.
   - `scope`: affected module/area from the changed paths. Optional; omit rather than guess.
   - `title`: imperative ("add", not "added"/"adds"), no trailing period, whole header under 72 chars.
   - `body`: 1–4 sentences on what changed and **why** — only a why you can actually support from the
     diff or the task you were given. Omit the body only for genuinely trivial changes.
   - `Refs`: ticket id from the branch name if there is one, as a footer — never in the title.

3. **Commit.** `git commit -m "<header>" -m "<body>" -m "Refs: …"` (each `-m` becomes a paragraph),
   or write the message to a file and use `git commit -F`.

## If you want a starting draft

`quietcommit --dry-run` prints a rule-based draft (type/scope/ticket inferred from paths + branch,
no body) without committing. Treat it as scaffolding — replace the title and add the real body from
your context before committing. `quietcommit --review` drafts and then prompts accept / edit /
regenerate / abort.

## Anti-patterns

- ❌ `wip`, `fix`, `update`, `misc`, `changes` — rejected as low-signal.
- ❌ A body that asserts a rationale not visible in the diff or stated in the task.
- ❌ Putting the ticket id in the title instead of a `Refs:` footer.
- ❌ `git commit --no-verify` to dodge the hook. If a rule is genuinely wrong for this repo, fix
  `.quietcommitrc.json` instead.

## Check setup

`quietcommit status` shows which hooks and agent-instruction files are installed in this repo and
the effective config.
