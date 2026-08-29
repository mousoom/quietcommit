'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('node:fs');
const path = require('node:path');

const git = require('./git');
const { loadConfig, writeConfig, CONFIG_FILENAME } = require('./config');
const draft = require('./draft');
const hookInstall = require('./hooks/install');
const hookRun = require('./hooks/run');
const claudePreToolUse = require('./hooks/claude-pretooluse');
const claudeCode = require('./integrations/claude-code');
const agentsMd = require('./integrations/agents-md');
const pkg = require('../package.json');

function fail(message) {
  process.stderr.write(chalk.red(`quietcommit: ${message}\n`));
  process.exitCode = 1;
}

function repoRootOrCwd(cwd) {
  return git.isGitRepo(cwd) ? git.repoRoot(cwd) : cwd;
}

function buildProgram() {
  const program = new Command();
  program
    .name('quietcommit')
    .description('Writes properly-formatted, detailed commit messages automatically.')
    .version(pkg.version);

  // --- default/standalone: `quietcommit` -> draft + commit staged changes ---
  program
    .command('commit', { isDefault: true })
    .description('Draft a commit message for staged changes and commit (goal #3: usable standalone).')
    .option('--review', 'show the draft and confirm before committing')
    .option('--dry-run', 'print the drafted message without committing')
    .action(async (opts) => {
      const cwd = process.cwd();
      if (!git.isGitRepo(cwd)) return fail('not inside a git repository');
      if (!git.hasStagedChanges(cwd)) return fail('nothing staged — run `git add` first');

      const config = loadConfig({ repoRoot: repoRootOrCwd(cwd) });
      let draftResult;
      try {
        draftResult = await draft.draft({ cwd, config });
      } catch (err) {
        return fail(err.message);
      }
      const message = draft.draftToMessage(draftResult);

      if (opts.dryRun) {
        process.stdout.write(message + '\n');
        return;
      }

      if (opts.review || config.requireApproval) {
        process.stdout.write(chalk.bold('\nDrafted commit message:\n\n'));
        process.stdout.write(message + '\n\n');
        const prompts = require('prompts');
        const { action } = await prompts({
          type: 'select',
          name: 'action',
          message: 'Accept this commit?',
          choices: [
            { title: 'Commit as-is', value: 'accept' },
            { title: 'Edit in $EDITOR', value: 'edit' },
            { title: 'Regenerate', value: 'regenerate' },
            { title: 'Abort', value: 'abort' },
          ],
        });
        if (action === 'abort' || action === undefined) {
          process.stdout.write('Aborted — nothing committed.\n');
          return;
        }
        if (action === 'regenerate') {
          return program.parseAsync(['node', 'quietcommit', 'commit', ...(opts.review ? ['--review'] : [])]);
        }
        if (action === 'edit') {
          const result = git.run(['commit', '-e', '-m', message], { cwd, stdio: 'inherit' });
          process.exitCode = result.status || 0;
          return;
        }
      }

      const result = git.run(['commit', '-m', message], { cwd, stdio: 'inherit' });
      process.exitCode = result.status || 0;
    });

  // --- install ---
  program
    .command('install')
    .description('Install quietcommit git hooks (and optionally the Claude Code / AGENTS.md integrations).')
    .option('--global', 'install hooks globally (core.hooksPath) instead of per-repo')
    .option('--claude-code', 'also register the Claude Code PreToolUse integration')
    .option('--agents-md', 'also write/update AGENTS.md with the commit convention')
    .option('--all', 'install hooks + Claude Code integration + AGENTS.md')
    .action((opts) => {
      const cwd = process.cwd();

      try {
        if (opts.global) {
          const { hooksDir, results } = hookInstall.installGlobal();
          process.stdout.write(chalk.green(`Installed global hooks in ${hooksDir}\n`));
          for (const r of results) process.stdout.write(`  ${r.name}: ${r.action}\n`);
        } else {
          if (!git.isGitRepo(cwd)) return fail('not inside a git repository (use --global to install machine-wide)');
          const { hooksDir, results } = hookInstall.installLocal(cwd);
          process.stdout.write(chalk.green(`Installed hooks in ${hooksDir}\n`));
          for (const r of results) process.stdout.write(`  ${r.name}: ${r.action}\n`);
        }

        if (opts.claudeCode || opts.all) {
          const root = repoRootOrCwd(cwd);
          const { settingsPath } = claudeCode.installClaudeCode(root);
          process.stdout.write(chalk.green(`Registered Claude Code PreToolUse hook in ${settingsPath}\n`));
        }

        if (opts.agentsMd || opts.all) {
          const root = repoRootOrCwd(cwd);
          const config = loadConfig({ repoRoot: root });
          const { filePath, action } = agentsMd.installAgentsMd(root, config);
          process.stdout.write(chalk.green(`AGENTS.md ${action}: ${filePath}\n`));
        }

        if (!fs.existsSync(path.join(repoRootOrCwd(cwd), CONFIG_FILENAME)) && !opts.global) {
          process.stdout.write(
            chalk.dim(`\nNo ${CONFIG_FILENAME} found — using defaults (silent, no approval required). ` +
            `Run \`quietcommit config\` to see or change them.\n`)
          );
        }
      } catch (err) {
        fail(err.message);
      }
    });

  // --- uninstall ---
  program
    .command('uninstall')
    .description('Remove quietcommit hooks and integrations, restoring whatever was there before.')
    .option('--global', 'uninstall global hooks')
    .option('--claude-code', 'also remove the Claude Code integration')
    .option('--agents-md', 'also remove the AGENTS.md block')
    .option('--all', 'remove hooks + Claude Code integration + AGENTS.md')
    .action((opts) => {
      const cwd = process.cwd();
      try {
        const { hooksDir, results } = opts.global ? hookInstall.uninstallGlobal() : hookInstall.uninstallLocal(cwd);
        process.stdout.write(chalk.green(`Uninstalled hooks from ${hooksDir}\n`));
        for (const r of results) process.stdout.write(`  ${r.name}: ${r.action}\n`);

        if (opts.claudeCode || opts.all) {
          const root = repoRootOrCwd(cwd);
          const r = claudeCode.uninstallClaudeCode(root);
          process.stdout.write(chalk.green(`Claude Code integration removed: ${JSON.stringify(r)}\n`));
        }
        if (opts.agentsMd || opts.all) {
          const root = repoRootOrCwd(cwd);
          const r = agentsMd.uninstallAgentsMd(root);
          process.stdout.write(chalk.green(`AGENTS.md: ${r.action}\n`));
        }
      } catch (err) {
        fail(err.message);
      }
    });

  // --- config ---
  program
    .command('config')
    .description('Show the effective config, or write a starter config file.')
    .option('--init', 'write a starter .quietcommitrc.json in the repo root')
    .action((opts) => {
      const cwd = process.cwd();
      const root = repoRootOrCwd(cwd);
      if (opts.init) {
        const target = path.join(root, CONFIG_FILENAME);
        if (fs.existsSync(target)) return fail(`${target} already exists`);
        const { DEFAULTS } = require('./config');
        writeConfig(target, DEFAULTS);
        process.stdout.write(chalk.green(`Wrote ${target}\n`));
        return;
      }
      const config = loadConfig({ repoRoot: root });
      const { sources, ...visible } = config;
      process.stdout.write(JSON.stringify(visible, null, 2) + '\n');
      process.stdout.write(chalk.dim(`\nglobal: ${sources.globalPath}\nrepo:   ${sources.repoPath || '(not in a repo)'}\n`));
    });

  // --- hook-run (internal; called by the installed shims / Claude Code hook) ---
  program
    .command('hook-run <name> [args...]')
    .description('internal: run a specific hook implementation (called by installed shims)')
    .allowUnknownOption(true)
    .action(async (name, args) => {
      const cwd = process.cwd();
      const config = loadConfig({ repoRoot: repoRootOrCwd(cwd) });

      if (name === 'prepare-commit-msg') {
        const [msgFile, source, sha] = args;
        try {
          await hookRun.runPrepareCommitMsg({ msgFile, source, sha, cwd, config });
        } catch (err) {
          // Never block commit creation from prepare-commit-msg — fail open.
          process.stderr.write(chalk.yellow(`quietcommit: prepare-commit-msg warning: ${err.message}\n`));
        }
        process.exit(0);
        return;
      }

      if (name === 'commit-msg') {
        const [msgFile] = args;
        let outcome;
        try {
          outcome = await hookRun.runCommitMsg({ msgFile, cwd, config });
        } catch (err) {
          process.stderr.write(chalk.yellow(`quietcommit: commit-msg warning: ${err.message}\n`));
          process.exit(0);
          return;
        }
        if (outcome.blocked) {
          process.stderr.write(chalk.red('\nquietcommit: commit blocked (requireApproval is on)\n\n'));
          for (const e of outcome.errors) process.stderr.write(chalk.red(`  - ${e}\n`));
          if (outcome.suggestion) {
            process.stderr.write(chalk.bold('\nSuggested message:\n\n'));
            process.stderr.write(outcome.suggestion + '\n\n');
            process.stderr.write('Retry with, e.g.: git commit -m "..." using the suggestion above,\n');
            process.stderr.write('or edit the message and retry, or `git commit --no-verify` to bypass.\n');
          }
          process.exit(1);
          return;
        }
        process.exit(0);
        return;
      }

      if (name === 'claude-pretooluse') {
        await claudePreToolUse.main();
        return;
      }

      fail(`unknown hook "${name}"`);
      process.exit(0);
    });

  return program;
}

module.exports = { buildProgram };
