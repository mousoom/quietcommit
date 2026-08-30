# Contributing to quietcommit

Thanks for taking the time. quietcommit is small and dependency-light on purpose — keep changes
minimal and well-tested.

## Setup

```sh
git clone https://github.com/mousoom/quietcommit.git
cd quietcommit
npm install
npm test
```

Node 20+ is required. There is no build step — it's plain CommonJS.

To dogfood the tool on this repo itself:

```sh
npm link            # puts the dev build on your PATH as `quietcommit`
quietcommit install # installs the git hooks into this checkout
quietcommit status  # confirms what's active
```

## Making a change

1. Open an issue first for anything non-trivial, so the approach can be agreed before you write code.
2. Branch from `main`. Name it `feat/…`, `fix/…`, `docs/…`, etc. — quietcommit reads the prefix.
3. Keep the change focused. One concern per PR.
4. Add or update tests in `test/`. `npm test` must pass. New behaviour without a test won't be merged.
5. Update `CHANGELOG.md` under `## [Unreleased]`.
6. Update `README.md` if you changed user-facing behaviour or the CLI surface.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) — and it has
quietcommit's own hooks installed, so a low-signal message gets rewritten or (in CI) rejected.
Write the real message yourself:

```
<type>(<scope>): <title>

<body — what changed and why, only what the diff/task actually supports>

Refs: <issue-id>
```

`type` is one of feat, fix, refactor, perf, docs, test, chore, build, ci, style, revert.

Do not use `git commit --no-verify` to bypass the hook. If a rule is wrong, raise it in an issue.

## Tests

- `npm test` runs the whole suite (`node --test`, no framework).
- Tests that touch git create throwaway repos under the OS temp dir and clean up after themselves.
- Keep assertions deterministic — force `NO_COLOR` / `FORCE_COLOR=0` for any test that inspects CLI
  output (see `test/env-and-status.test.js` for the pattern).

## Pull requests

- CI (Linux/macOS/Windows × Node 20/22/24) must be green.
- A maintainer review is required before merge. Be patient and responsive to review comments.
- By submitting a PR you agree your contribution is licensed under the project's MIT License.

## Releases

Maintainers only. `npm version <patch|minor|major>` → push the commit and tag → `release.yml`
publishes to npm via OIDC and cuts the GitHub Release. Contributors never need to touch this.

## Scope

quietcommit deliberately stays narrow — see "What v1 doesn't do" in the README and the PRD.
Adapters for more platforms, deep config, analytics, and history rewriting are out of scope unless
discussed first.
