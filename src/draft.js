'use strict';

const git = require('./git');
const { inferType, inferScope, inferTicket } = require('./infer');
const { format } = require('./conventional');

const VERB_BY_STATUS = { A: 'add', M: 'update', D: 'remove', R: 'rename', C: 'copy' };

function baseName(p) {
  const parts = p.split('/');
  return parts[parts.length - 1];
}

function majorityStatus(files) {
  const counts = {};
  for (const f of files) counts[f.status] = (counts[f.status] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Build a short, honest title from the staged file list alone — no AI, no
 * invented rationale. This is deliberately modest: a single verb plus what
 * changed, never a claimed "why".
 */
function ruleBasedTitle(files, scope) {
  if (files.length === 1) {
    const f = files[0];
    const verb = VERB_BY_STATUS[f.status] || 'update';
    return `${verb} ${baseName(f.path)}`;
  }

  const verb = VERB_BY_STATUS[majorityStatus(files)] || 'update';
  if (scope) {
    return `${verb} ${files.length} files in ${scope}`;
  }
  return `${verb} ${files.length} files`;
}

/**
 * The always-available, no-AI, no-key drafting path: Conventional Commits
 * structure inferred from changed file paths and the branch name, with no
 * drafted body (we can't honestly explain "why" without reasoning over the
 * diff, so we don't pretend to).
 */
function ruleBasedDraft({ cwd, config } = {}) {
  const files = git.stagedFiles(cwd);
  if (files.length === 0) {
    throw new Error('nothing staged — stage changes first (git add ...)');
  }
  const branch = git.currentBranch(cwd);
  const type = inferType(files, branch, config && config.allowedTypes);
  const scope = inferScope(files);
  const refs = inferTicket(branch, config && config.ticketPattern);

  return {
    type,
    scope,
    title: ruleBasedTitle(files, scope),
    body: null,
    refs,
    breaking: false,
    breakingDescription: null,
    source: 'rule-based',
  };
}

const AI_SYSTEM_PROMPT = `You write git commit messages in the Conventional Commits v1.0.0 format.
Given a git diff, respond with ONLY a JSON object (no prose, no markdown fences) with these fields:
  "type": one of feat, fix, refactor, perf, docs, test, chore, build, ci, style, revert
  "scope": a short module/area name inferred from the changed paths, or null
  "title": imperative mood, no trailing period, under 72 characters total including the "type(scope): " prefix
  "body": 1-4 sentences explaining what changed and why, ONLY stating things directly evidenced by the diff — never invent a rationale that isn't visible in the change itself. Use null if the diff is trivial enough not to need one.
  "breaking": true or false
  "breakingDescription": a short description if breaking is true, else null
Be conservative: hedge or omit rather than assert a "why" you can't actually see in the diff.`;

/**
 * Parse a JSON object out of a model response that may be wrapped in
 * ```json fences or padded with stray prose, despite the prompt asking for
 * bare JSON. Falls back to the widest {...} span before giving up.
 */
function parseModelJson(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1));
    }
    throw new Error('model response was not parseable JSON');
  }
}

async function anthropicDraft({ diff, stat, backend }) {
  const apiKey = backend.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('headlessBackend.provider is "anthropic" but no apiKey is configured');

  const model = backend.model || 'claude-haiku-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: AI_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `diffstat:\n${stat}\n\ndiff:\n${diff.slice(0, 20000)}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic API returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('');
  return parseModelJson(text);
}

async function ollamaDraft({ diff, stat, backend }) {
  const host = backend.host || 'http://localhost:11434';
  const model = backend.model || 'llama3';

  const res = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: `${AI_SYSTEM_PROMPT}\n\ndiffstat:\n${stat}\n\ndiff:\n${diff.slice(0, 20000)}`,
      stream: false,
      format: 'json',
    }),
  });

  if (!res.ok) {
    throw new Error(`ollama returned ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return parseModelJson(data.response);
}

/**
 * Opt-in AI drafting for the headless/no-agent scenario (PRD section 7,
 * bare terminal, no agent session present). Never runs unless the user
 * has explicitly configured `headlessBackend` — see config.js defaults.
 * Falls back to the rule-based draft on any failure so a flaky network
 * call or bad key never blocks a commit outright.
 */
async function backendDraft({ cwd, config }) {
  const files = git.stagedFiles(cwd);
  if (files.length === 0) {
    throw new Error('nothing staged — stage changes first (git add ...)');
  }
  const branch = git.currentBranch(cwd);
  const refs = inferTicket(branch, config.ticketPattern);
  const diff = git.stagedDiff(cwd);
  const stat = git.stagedDiffStat(cwd);

  const backend = config.headlessBackend;
  let ai;
  try {
    if (backend.provider === 'anthropic') {
      ai = await anthropicDraft({ diff, stat, backend });
    } else if (backend.provider === 'ollama') {
      ai = await ollamaDraft({ diff, stat, backend });
    } else {
      throw new Error(`unknown headlessBackend.provider "${backend.provider}"`);
    }
  } catch (err) {
    const fallback = ruleBasedDraft({ cwd, config });
    fallback.source = 'rule-based-fallback';
    fallback.fallbackReason = err.message;
    return fallback;
  }

  return {
    type: ai.type,
    scope: ai.scope || null,
    title: ai.title,
    body: ai.body || null,
    refs: ai.refs || refs,
    breaking: Boolean(ai.breaking),
    breakingDescription: ai.breakingDescription || null,
    source: `ai:${backend.provider}`,
  };
}

/**
 * Top-level entry point: draft a commit message for the current staged
 * changes, using an AI backend if the user opted into one, otherwise the
 * always-free rule-based formatter.
 */
async function draft({ cwd, config } = {}) {
  const resolvedCwd = cwd || process.cwd();
  if (config && config.headlessBackend) {
    return backendDraft({ cwd: resolvedCwd, config });
  }
  return ruleBasedDraft({ cwd: resolvedCwd, config });
}

function draftToMessage(draftResult) {
  return format(draftResult);
}

module.exports = { draft, ruleBasedDraft, backendDraft, draftToMessage, ruleBasedTitle, parseModelJson };
