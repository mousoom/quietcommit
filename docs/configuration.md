# Configuration

Zero config is needed for the default behaviour (silent, no approval, rule-based drafting when no
agent is present).

## `.quietcommitrc.json`

Put it in the repo root, or `~/.quietcommitrc.json` for machine-wide defaults. A repo file
overrides the global one, key by key.

```jsonc
{
  "requireApproval": false,   // true adds a checkpoint — see "Approval mode" below
  "allowedTypes": ["feat","fix","refactor","perf","docs","test","chore","build","ci","style","revert"],
  "ticketPattern": null,      // override the default TICKET-NUMBER branch regex if yours differs
  "headlessBackend": null     // opt-in AI drafting for the no-agent case — see below
}
```

- `quietcommit config` prints the effective merged config and the path each value came from.
- `quietcommit config --init` writes a starter file.

### `ticketPattern`

A regex (as a string) used to pull a ticket id out of the branch name. The first capture group is
the id. When left `null`, quietcommit tries an ordered set of built-in patterns covering
`ABC-12_…`, `feature/ABC-12-…`, `feature/1234-…`, `ENG-1234-…`, and bare `1234-…`.

### `headlessBackend`

Only used when **no agent is present** and you still want an AI-drafted body. Never runs otherwise.
Falls back to the rule-based draft on any failure, so a flaky network call or bad key never blocks
a commit.

```jsonc
// your own Anthropic key — the staged diff goes to api.anthropic.com and nowhere else
{ "provider": "anthropic", "apiKey": "sk-ant-...", "model": "claude-haiku-4-5" }

// a local Ollama model — nothing leaves the machine
{ "provider": "ollama", "host": "http://localhost:11434", "model": "llama3" }
```

`apiKey` can be omitted if `ANTHROPIC_API_KEY` is set in the environment (preferred — keeps the key
out of a file that might get committed).

## Environment overrides

Change behaviour without touching any rc file — handy for CI, scripts, or a one-off commit.
Accepted truthy values: `1`, `true`, `yes`, `on` (case-insensitive).

- **`QUIETCOMMIT_DISABLE=1`** — every git hook becomes a transparent no-op; commits behave exactly
  as if quietcommit weren't installed. Explicit `quietcommit` subcommands still work. Unlike
  `git commit --no-verify`, this doesn't also skip every *other* hook in the repo.
- **`QUIETCOMMIT_STRICT=1`** — forces `requireApproval` on for this invocation, regardless of
  config.

## Approval mode (`requireApproval: true`)

Off by default — the point of the tool is not adding a checkpoint nobody asked for. When on:

- **Interactive commit** (`git commit` with no `-m`, an editor opens): the draft is pre-filled.
  Your normal review-and-save *is* the approval; aborting the editor aborts the commit, exactly as
  usual.
- **Non-interactive commit** (`-m`, or an agent): there's no live human in the moment, so
  quietcommit validates the message and **blocks the commit** (exit 1) if it fails the bar,
  printing the specific problems and a ready-made suggested replacement. Retry with a better
  message, or `git commit --no-verify` to bypass like any git hook.
