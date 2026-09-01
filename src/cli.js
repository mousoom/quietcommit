'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const git = require('./git');
const { loadConfig, writeConfig, CONFIG_FILENAME, envFlag } = require('./config');
const draft = require('./draft');
const hookInstall = require('./hooks/install');
const hookRun = require('./hooks/run');
const claudePreToolUse = require('./hooks/claude-pretooluse');
const claudeCode = require('./integrations/claude-code');
const agentsMd = require('./integrations/agents-md');
const editorRules = require('./integrations/editor-rules');
const gitExclude = require('./git-exclude');
const pkg = require('../package.json');

// Repo-root-relative paths each integration writes into the working tree —
// used by `install --local-only` to keep them out of a shared branch.
const LOCAL_ONLY_PATHS = {
  claudeCode: ['.claude/settings.json', '.claude/hooks/quietcommit-pretooluse.sh', '.claude/skills/quietcommit/'],
  agentsMd: ['AGENTS.md'],
  cursor: ['.cursor/rules/quietcommit.mdc'],
  copilot: ['.github/copilot-instructions.md'],
};

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
    .option('--claude-code', 'also register the Claude Code PreToolUse hook + /quietcommit skill')
    .option('--agents-md', 'also write/update AGENTS.md with the commit convention')
    .option('--cursor', 'also write/update .cursor/rules/quietcommit.mdc')
    .option('--copilot', 'also write/update .github/copilot-instructions.md')
    .option('--all', 'install hooks + every agent integration (Claude Code, AGENTS.md, Cursor, Copilot)')
    .option('--local-only', 'also add the agent-integration files to .git/info/exclude so they are never committed or pushed')
    .action((opts) => {
      const cwd = process.cwd();
      const installed = []; // integration keys actually installed this run

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
          const { settingsPath, skillPath } = claudeCode.installClaudeCode(root);
          process.stdout.write(chalk.green(`Registered Claude Code PreToolUse hook in ${settingsPath}\n`));
          if (skillPath) process.stdout.write(chalk.green(`Installed /quietcommit skill: ${skillPath}\n`));
          installed.push('claudeCode');
        }

        if (opts.agentsMd || opts.all) {
          const root = repoRootOrCwd(cwd);
          const config = loadConfig({ repoRoot: root });
          const { filePath, action } = agentsMd.installAgentsMd(root, config);
          process.stdout.write(chalk.green(`AGENTS.md ${action}: ${filePath}\n`));
          installed.push('agentsMd');
        }

        if (opts.cursor || opts.all) {
          const root = repoRootOrCwd(cwd);
          const config = loadConfig({ repoRoot: root });
          const { filePath, action } = editorRules.installCursor(root, config);
          process.stdout.write(chalk.green(`Cursor rule ${action}: ${filePath}\n`));
          installed.push('cursor');
        }

        if (opts.copilot || opts.all) {
          const root = repoRootOrCwd(cwd);
          const config = loadConfig({ repoRoot: root });
          const { filePath, action } = editorRules.installCopilot(root, config);
          process.stdout.write(chalk.green(`Copilot instructions ${action}: ${filePath}\n`));
          installed.push('copilot');
        }

        if (opts.localOnly) {
          if (opts.global) {
            process.stdout.write(chalk.yellow('--local-only ignored: --global installs no working-tree files\n'));
          } else {
            const paths = [...new Set(installed.flatMap((k) => LOCAL_ONLY_PATHS[k] || []))];
            if (paths.length === 0) {
              process.stdout.write(
                chalk.yellow('--local-only had nothing to exclude — pass it alongside an integration flag (e.g. --claude-code)\n')
              );
            } else {
              const { excludePath, action } = gitExclude.applyLocalExclude(cwd, paths);
              process.stdout.write(chalk.green(`.git/info/exclude ${action} (${paths.length} path(s)): ${excludePath}\n`));
            }
          }
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
    .option('--cursor', 'also remove the Cursor rule')
    .option('--copilot', 'also remove the Copilot instructions block')
    .option('--all', 'remove hooks + every agent integration')
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
        if (opts.cursor || opts.all) {
          const root = repoRootOrCwd(cwd);
          const r = editorRules.uninstallCursor(root);
          process.stdout.write(chalk.green(`Cursor rule: ${r.action}\n`));
        }
        if (opts.copilot || opts.all) {
          const root = repoRootOrCwd(cwd);
          const r = editorRules.uninstallCopilot(root);
          process.stdout.write(chalk.green(`Copilot instructions: ${r.action}\n`));
        }

        if (!opts.global) {
          const r = gitExclude.removeLocalExclude(cwd);
          if (r.action === 'removed') {
            process.stdout.write(chalk.green(`.git/info/exclude: quietcommit block removed\n`));
          }
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

  // --- status ---
  program
    .command('status')
    .description('Show what quietcommit has installed in this repo and the effective config.')
    .action(() => {
      const cwd = process.cwd();
      const inRepo = git.isGitRepo(cwd);
      const root = inRepo ? git.repoRoot(cwd) : cwd;
      const lines = [chalk.bold('quietcommit status'), ''];

      const disabled = envFlag('QUIETCOMMIT_DISABLE');
      const strict = envFlag('QUIETCOMMIT_STRICT');
      if (disabled) lines.push(chalk.yellow('  QUIETCOMMIT_DISABLE=1 — every hook is currently a no-op'));
      if (strict) lines.push(chalk.yellow('  QUIETCOMMIT_STRICT=1 — approval mode is forced on'));
      if (disabled || strict) lines.push('');

      if (!inRepo) {
        lines.push(chalk.dim('  not inside a git repository — hook status unavailable'));
      } else {
        lines.push(`  repo:      ${root}`);
        let hooksDir;
        try {
          hooksDir = git.hooksPath(cwd);
          lines.push(`  hooks dir: ${hooksDir}`);
        } catch (err) {
          lines.push(chalk.red(`  hooks dir: could not resolve (${err.message})`));
        }
        if (hooksDir) {
          for (const name of hookInstall.HOOK_NAMES) {
            const p = path.join(hooksDir, name);
            const exists = fs.existsSync(p);
            const managed = exists && hookInstall.isQuietcommitShim(p);
            const chained = fs.existsSync(`${p}.quietcommit-original`);
            const state = managed
              ? chalk.green('installed') + (chained ? chalk.dim(' (chained onto a pre-existing hook)') : '')
              : exists
                ? chalk.yellow('present, not quietcommit-managed')
                : chalk.dim('not installed');
            lines.push(`    ${name}: ${state}`);
          }
        }

        const globalHooksPath = git.configGet('core.hooksPath', { cwd: os.homedir() });
        if (globalHooksPath) {
          const isOurs = path.resolve(globalHooksPath) === path.resolve(hookInstall.GLOBAL_HOOKS_DIR);
          lines.push(`  global core.hooksPath: ${globalHooksPath}${isOurs ? chalk.green(' (quietcommit)') : ''}`);
        }

        const cc = claudeCode.claudeCodeStatus(root);
        lines.push(
          `  Claude Code hook: ${cc.registered ? chalk.green('registered') : chalk.dim('not registered')}` +
          (cc.registered && !cc.scriptExists ? chalk.red(' — script file missing') : '')
        );
        lines.push(`  /quietcommit skill: ${cc.skillInstalled ? chalk.green('installed') : chalk.dim('not installed')}`);

        const am = agentsMd.agentsMdStatus(root);
        lines.push(`  AGENTS.md block:  ${am.present ? chalk.green('present') : chalk.dim('absent')}`);

        const cur = editorRules.cursorStatus(root);
        lines.push(`  Cursor rule:      ${cur.present ? chalk.green('present') : chalk.dim('absent')}`);

        const cop = editorRules.copilotStatus(root);
        lines.push(`  Copilot block:    ${cop.present ? chalk.green('present') : chalk.dim('absent')}`);

        const ex = gitExclude.localExcludeStatus(cwd);
        lines.push(
          `  local-only exclude: ${ex.applied ? chalk.green(`on (${ex.paths.length} path(s) in .git/info/exclude)`) : chalk.dim('off')}`
        );
      }

      lines.push('');
      const config = loadConfig({ repoRoot: root });
      lines.push(chalk.bold('  effective config'));
      lines.push(`    requireApproval: ${config.requireApproval}`);
      lines.push(`    allowedTypes:    ${config.allowedTypes.length} types`);
      lines.push(`    ticketPattern:   ${config.ticketPattern}`);
      lines.push(
        `    headlessBackend: ${config.headlessBackend ? config.headlessBackend.provider : 'none (rule-based / agent only)'}`
      );
      lines.push(chalk.dim(`    global: ${config.sources.globalPath}`));
      lines.push(chalk.dim(`    repo:   ${config.sources.repoPath || '(not in a repo)'}`));

      process.stdout.write(lines.join('\n') + '\n');
    });

  // --- hook-run (internal; called by the installed shims / Claude Code hook) ---
  program
    .command('hook-run <name> [args...]')
    .description('internal: run a specific hook implementation (called by installed shims)')
    .allowUnknownOption(true)
    .action(async (name, args) => {
      const cwd = process.cwd();

      // QUIETCOMMIT_DISABLE — behave as a transparent no-op for every hook
      // entry point, so a commit proceeds exactly as if quietcommit weren't
      // installed. Explicit `quietcommit` subcommands still work.
      if (envFlag('QUIETCOMMIT_DISABLE')) {
        process.exit(0);
        return;
      }

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
