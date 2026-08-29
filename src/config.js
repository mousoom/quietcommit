'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DEFAULT_TYPES } = require('./conventional');
const { DEFAULT_TICKET_PATTERN } = require('./infer');

const CONFIG_FILENAME = '.quietcommitrc.json';

const DEFAULTS = {
  requireApproval: false, // the core v1 default — silent, no approval gate
  allowedTypes: DEFAULT_TYPES,
  ticketPattern: null, // null => use infer.js's DEFAULT_TICKET_PATTERN
  headlessBackend: null, // opt-in only, e.g. { provider: 'anthropic', apiKey: '...' } or { provider: 'ollama' }
};

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`could not parse ${filePath}: ${err.message}`);
  }
}

/**
 * Load config with precedence: repo-level .quietcommitrc.json overrides
 * global (~/.quietcommitrc.json) overrides built-in defaults.
 */
function loadConfig({ repoRoot } = {}) {
  const globalPath = path.join(os.homedir(), CONFIG_FILENAME);
  const repoPath = repoRoot ? path.join(repoRoot, CONFIG_FILENAME) : null;

  const globalConfig = readJsonIfExists(globalPath) || {};
  const repoConfig = readJsonIfExists(repoPath) || {};

  const merged = { ...DEFAULTS, ...globalConfig, ...repoConfig };

  return {
    ...merged,
    ticketPattern: merged.ticketPattern || DEFAULT_TICKET_PATTERN,
    sources: { globalPath, repoPath },
  };
}

function writeConfig(targetPath, config) {
  const toWrite = { ...config };
  delete toWrite.sources;
  fs.writeFileSync(targetPath, JSON.stringify(toWrite, null, 2) + '\n', 'utf8');
}

module.exports = { loadConfig, writeConfig, DEFAULTS, CONFIG_FILENAME };
