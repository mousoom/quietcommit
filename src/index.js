'use strict';

// Library entry point (in addition to the CLI in bin/quietcommit.js) —
// exposes the pieces that are useful to import directly, e.g. from tests
// or from a future MCP server (see PRD non-goals, v1.1/v2).
module.exports = {
  git: require('./git'),
  conventional: require('./conventional'),
  infer: require('./infer'),
  draft: require('./draft'),
  quality: require('./quality'),
  config: require('./config'),
  hooks: {
    install: require('./hooks/install'),
    run: require('./hooks/run'),
    claudePreToolUse: require('./hooks/claude-pretooluse'),
  },
  integrations: {
    claudeCode: require('./integrations/claude-code'),
    agentsMd: require('./integrations/agents-md'),
  },
};
