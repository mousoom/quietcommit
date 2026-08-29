#!/usr/bin/env node
'use strict';

const { buildProgram } = require('../src/cli');

buildProgram().parseAsync(process.argv).catch((err) => {
  process.stderr.write(`quietcommit: unexpected error: ${err && err.stack ? err.stack : err}\n`);
  process.exitCode = 1;
});
