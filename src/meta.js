'use strict';

// One place for package identity used in generated files (hook shims, skill
// headers). Keep the URL in package.json; derive the bare repo URL here.
const pkg = require('../package.json');

const REPO_URL = (pkg.homepage || '').replace(/#.*$/, '') || 'https://github.com/mousoom/quietcommit';

module.exports = { REPO_URL, VERSION: pkg.version, NAME: pkg.name };
