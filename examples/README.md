# Examples

Real output, not mock-ups. Each block below is an actual staged diff and the message
`quietcommit --dry-run` produced for it on the branch shown. These double as fixtures — the
rule-based drafts are deterministic.

Three drafting paths exist (see the main README):

- **rule-based** — no AI, no key, no network. Structure only, no body. This is what the examples
  below show.
- **agent-written** — an AI agent already doing the commit writes the message from its task
  context. Same structure, plus a real body.
- **AI-backed** (`headlessBackend`, opt-in) — an API or local model drafts a body from the diff.

---

## 1. New source file, `feat/` branch

Branch: `feat/rate-limiter`

```diff
diff --git a/src/rate-limiter.js b/src/rate-limiter.js
new file mode 100644
--- /dev/null
+++ b/src/rate-limiter.js
@@ -0,0 +1,2 @@
+function limit(){ return true }
+module.exports={limit}
```

**rule-based draft:**

```
feat(src): add rate-limiter.js
```

`type` = `feat` (all files added), `scope` = `src` (shared top-level dir), no ticket in the branch.

**agent-written would add a body:**

```
feat(src): add token-bucket rate limiter

Introduces limit() as the entry point for per-caller request throttling,
wired up in a follow-up. No callers yet.
```

---

## 2. Bug fix to an existing file, bare-number issue branch

Branch: `1487-null-deref`

```diff
diff --git a/src/parse.js b/src/parse.js
--- a/src/parse.js
+++ b/src/parse.js
@@ -1 +1 @@
-module.exports=function parse(x){ return x.trim() }
+module.exports=function parse(x){ return (x||"").trim() }
```

**rule-based draft:**

```
fix(src): update parse.js

Refs: 1487
```

`type` = `fix` (modification to an existing file, no `fix/` prefix on the branch), ticket `1487`
picked up as a bare GitHub/GitLab-style issue number from the branch name.

---

## 3. Docs only, multiple files

Branch: `main`

```diff
diff --git a/docs/faq.md b/docs/faq.md
new file mode 100644
+++ b/docs/faq.md
@@ -0,0 +1 @@
+# FAQ
diff --git a/docs/guide.md b/docs/guide.md
new file mode 100644
+++ b/docs/guide.md
@@ -0,0 +1 @@
+# Guide
```

**rule-based draft:**

```
docs(docs): add 2 files in docs
```

`type` = `docs` (every path matches the docs rule), `scope` = `docs`, no ticket.

---

## 4. JIRA-style ticket, nested scope

Branch: `feature/PLATFORM-88-add-cache`

```diff
diff --git a/src/cache/config.js b/src/cache/config.js
new file mode 100644
+++ b/src/cache/config.js
@@ -0,0 +1 @@
+exports.ttl=60
diff --git a/src/cache/index.js b/src/cache/index.js
new file mode 100644
+++ b/src/cache/index.js
@@ -0,0 +1 @@
+exports.get=()=>null
```

**rule-based draft:**

```
feat(src): add 2 files in src

Refs: PLATFORM-88
```

`type` = `feat` (all added), `scope` = `src` (shared top-level dir), ticket `PLATFORM-88` from the
branch. An agent committing this would tighten the title to e.g.
`feat(cache): add read-through cache module` and add a body.
