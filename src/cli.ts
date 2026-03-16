#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import { loadConfig, validateConfig } from './config';
import { runPipeline } from './pipeline';
import { detectStack } from './stackDetector';
import { analyzeRepository } from './analyzer';
import { runRuleEngine } from './ruleEngine';
import { mapArchitecture } from './architectureMapper';
import { printTerminalReport, exportReport, printWelcomeUI } from './reportGenerator';
import { Cache } from './cache';
import { logger } from './logger';
import { getUsageSummary } from './rateLimiter';
import updateNotifier from 'update-notifier';

let pkg: { name: string; version: string } = { name: 'stacked-cli', version: '0.0.0' };
try {
  pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
} catch { /* use fallback version */ }

updateNotifier({ pkg }).notify();

const program = new Command();

program
  .name('stacker')
  .description('Analyze software repositories and get AI-powered stack improvement recommendations')
  .version(pkg.version)
  .option('-v, --verbose', 'Enable verbose output')
  .option('--skip-ai', 'Run rule-based analysis only, skip AI models')
  .option('--no-cache', 'Disable response caching')
  .option('--output <path>', 'Save report to file (.json or .md)')
  .option('--format <format>', 'Output format: terminal | json | markdown', 'terminal');

// ── stacker analyze <target> ─────────────────────────────────────
program
  .command('analyze [target]')
  .description('Analyze a repository (local path or GitHub URL)')
  .option('--skip-ai', 'Run rule-based analysis only')
  .option('--output <path>', 'Save report to file')
  .option('--format <format>', 'Output format: terminal | json | markdown')
  .action(async (target = '.', cmdOptions) => {
    const config = loadConfig();
    applyGlobalOptions(config);

    if (cmdOptions.skipAi) config.skipAI = true;

    if (validateConfig(config).length > 0) config.skipAI = true;

    try {
      await runPipeline({
        target,
        config,
        outputPath: cmdOptions.output || program.opts().output,
        outputFormat: cmdOptions.format || program.opts().format
      });
    } catch (err) {
      logger.error(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      if (config.verbose) console.error(err);
      process.exit(1);
    }
  });

// ── stacker security <target> ────────────────────────────────────
program
  .command('security [target]')
  .description('Scan a repository for security vulnerabilities')
  .option('--skip-ai', 'Run rule-based analysis only')
  .option('--output <path>', 'Save report to file')
  .option('--format <format>', 'Output format: terminal | json | markdown')
  .action(async (target = '.', cmdOptions) => {
    const config = loadConfig();
    applyGlobalOptions(config);

    if (cmdOptions.skipAi) config.skipAI = true;
    if (validateConfig(config).length > 0) config.skipAI = true;

    try {
      await runPipeline({
        target,
        config,
        outputPath: cmdOptions.output || program.opts().output,
        outputFormat: cmdOptions.format || program.opts().format,
        mode: 'security'
      });
    } catch (err) {
      logger.error(`Security analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      if (config.verbose) console.error(err);
      process.exit(1);
    }
  });

// ── stacker deployment <target> ──────────────────────────────────
program
  .command('deployment [target]')
  .description('Get deployment recommendations for a repository')
  .option('--skip-ai', 'Run rule-based analysis only')
  .option('--output <path>', 'Save report to file')
  .option('--format <format>', 'Output format: terminal | json | markdown')
  .action(async (target = '.', cmdOptions) => {
    const config = loadConfig();
    applyGlobalOptions(config);

    if (cmdOptions.skipAi) config.skipAI = true;
    if (validateConfig(config).length > 0) config.skipAI = true;

    try {
      await runPipeline({
        target,
        config,
        outputPath: cmdOptions.output || program.opts().output,
        outputFormat: cmdOptions.format || program.opts().format,
        mode: 'deployment'
      });
    } catch (err) {
      logger.error(`Deployment analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      if (config.verbose) console.error(err);
      process.exit(1);
    }
  });

// ── stacker codebase <target> ────────────────────────────────────
program
  .command('codebase [target]')
  .description('Run comprehensive analysis: stack + security + deployment')
  .option('--skip-ai', 'Run rule-based analysis only')
  .option('--output <path>', 'Save report to file')
  .option('--format <format>', 'Output format: terminal | json | markdown')
  .action(async (target = '.', cmdOptions) => {
    const config = loadConfig();
    applyGlobalOptions(config);

    if (cmdOptions.skipAi) config.skipAI = true;
    if (validateConfig(config).length > 0) config.skipAI = true;

    try {
      await runPipeline({
        target,
        config,
        outputPath: cmdOptions.output || program.opts().output,
        outputFormat: cmdOptions.format || program.opts().format,
        mode: 'codebase'
      });
    } catch (err) {
      logger.error(`Codebase analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      if (config.verbose) console.error(err);
      process.exit(1);
    }
  });

// ── stacker suggest <target> ─────────────────────────────────────
program
  .command('suggest [target]')
  .description('Get stack improvement suggestions (alias for analyze)')
  .option('--skip-ai', 'Run rule-based analysis only')
  .option('--output <path>', 'Save report to file')
  .action(async (target = '.', cmdOptions) => {
    const config = loadConfig();
    applyGlobalOptions(config);
    if (cmdOptions.skipAi) config.skipAI = true;

    if (validateConfig(config).length > 0) config.skipAI = true;

    try {
      await runPipeline({
        target,
        config,
        outputPath: cmdOptions.output || program.opts().output
      });
    } catch (err) {
      logger.error(`Suggestion failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ── stacker report <target> ──────────────────────────────────────
program
  .command('report [target]')
  .description('Generate a full report and save to file')
  .option('--output <path>', 'Output file path (default: stacker-report.md)')
  .option('--format <format>', 'Report format: json | markdown', 'markdown')
  .action(async (target = '.', cmdOptions) => {
    const config = loadConfig();
    applyGlobalOptions(config);

    const outputPath = cmdOptions.output || `stacker-report.${cmdOptions.format === 'json' ? 'json' : 'md'}`;

    if (validateConfig(config).length > 0) config.skipAI = true;

    try {
      const report = await runPipeline({ target, config, outputPath });
      logger.success(`Report saved: ${path.resolve(outputPath)}`);
    } catch (err) {
      logger.error(`Report generation failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ── stacker compare <target1> <target2> ─────────────────────────
program
  .command('compare <target1> <target2>')
  .description('Compare the stacks of two repositories')
  .action(async (target1: string, target2: string) => {
    const config = loadConfig();
    applyGlobalOptions(config);
    config.skipAI = true; // comparison is rule-based for speed

    console.log();
    console.log(chalk.bold.blue('  Stacker') + chalk.dim(' — Stack Comparison'));
    console.log(chalk.dim('  ' + '─'.repeat(50)));
    console.log();

    try {
      const { resolveRepository } = await import('./repoCloner');

      const [repo1, repo2] = await Promise.all([
        resolveRepository(target1),
        resolveRepository(target2)
      ]);

      const [stack1, stack2] = [detectStack(repo1.repoPath), detectStack(repo2.repoPath)];
      const [stats1, stats2] = await Promise.all([
        analyzeRepository(repo1.repoPath),
        analyzeRepository(repo2.repoPath)
      ]);

      printComparison(repo1.repoName, repo2.repoName, stack1, stack2, stats1, stats2);

      repo1.cleanupFn();
      repo2.cleanupFn();
    } catch (err) {
      logger.error(`Comparison failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ── stacker config ───────────────────────────────────────────────
program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    const config = loadConfig();
    const { isLoggedIn } = await import('./commands/login');
    const loggedIn = isLoggedIn();
    console.log();
    console.log(chalk.bold('  Stacker Configuration'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    console.log();
    console.log(`  Provider         ${chalk.cyan(config.provider)}`);
    console.log(`  Analysis Model   ${chalk.cyan(config.analysisModel)}`);
    console.log(`  Reasoning Model  ${chalk.cyan(config.reasoningModel)}`);
    console.log(`  AI               ${loggedIn ? chalk.green('Enabled') : chalk.yellow('Run stacker login to enable AI')}`);
    console.log(`  Cache            ${config.cacheEnabled ? chalk.green('Enabled') : chalk.dim('Disabled')}`);
    console.log(`  Cache Dir        ${chalk.dim(config.cacheDir)}`);
    console.log(`  Retries          ${config.retries}`);
    console.log(`  Timeout          ${config.timeout}ms`);
    console.log();
  });

// ── stacker init (hidden admin command) ──────────────────────────
// Not shown in help. For the tool owner to configure AI credentials.
program
  .command('init', { hidden: true })
  .action(async () => {
    const readline = require('readline');
    const configDir = path.join(require('os').homedir(), '.config', 'stacker');
    const envFile = path.join(configDir, '.env');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Service credential: ', (key: string) => {
      rl.close();
      const trimmed = key.trim();
      if (!trimmed || trimmed.length < 20) {
        logger.error('Invalid credential.');
        process.exit(1);
      }
      try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.chmodSync(configDir, 0o700);
        fs.writeFileSync(envFile, `GROQ_API_KEY=${trimmed}\n`, { encoding: 'utf-8', mode: 0o600 });
        logger.success('Configured.');
      } catch (err) {
        logger.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
  });

// ── stacker cache clear ──────────────────────────────────────────
program
  .command('cache <action>')
  .description('Manage the response cache (actions: clear | status)')
  .action((action: string) => {
    const config = loadConfig();
    const cache = new Cache(config.cacheDir, true);

    if (action === 'clear') {
      cache.clear();
      logger.success('Cache cleared.');
    } else if (action === 'status') {
      try {
        const files = fs.readdirSync(config.cacheDir).filter((f: string) => f.endsWith('.json'));
        console.log(`\n  Cache directory: ${chalk.cyan(config.cacheDir)}`);
        console.log(`  Cached entries:  ${chalk.cyan(files.length)}\n`);
      } catch {
        console.log(`\n  Cache directory does not exist yet.\n`);
      }
    } else {
      logger.error(`Unknown cache action: ${action}. Use 'clear' or 'status'.`);
    }
  });

// ── stacker usage ────────────────────────────────────────────────
program
  .command('usage')
  .description('Show API usage against free-tier rate limits')
  .action(() => {
    const summary = getUsageSummary();
    console.log();
    console.log(chalk.bold('  Groq Free-Tier API Usage'));
    console.log(chalk.dim('  ' + '─'.repeat(72)));
    console.log(
      chalk.dim('  ' + 'Model'.padEnd(46) + 'Minute'.padEnd(14) + 'Daily'.padEnd(14))
    );
    console.log(chalk.dim('  ' + '─'.repeat(72)));

    for (const m of summary) {
      const minutePct = m.minuteUsed / m.minuteLimit;
      const dayPct    = m.dayUsed    / m.dayLimit;

      const minuteStr = `${m.minuteUsed}/${m.minuteLimit}`;
      const dayStr    = `${m.dayUsed.toLocaleString()}/${m.dayLimit.toLocaleString()}`;

      const minuteColor = minutePct >= 1 ? chalk.red : minutePct >= 0.8 ? chalk.yellow : chalk.green;
      const dayColor    = dayPct    >= 1 ? chalk.red : dayPct    >= 0.8 ? chalk.yellow : chalk.green;

      const label = m.label.length > 44 ? m.label.slice(0, 42) + '..' : m.label;
      console.log(
        `  ${label.padEnd(46)}` +
        minuteColor(minuteStr.padEnd(14)) +
        dayColor(dayStr)
      );
    }

    console.log(chalk.dim('  ' + '─'.repeat(72)));
    console.log(chalk.dim('  Counters are per-machine. Reset: minute counters every 60s, daily at midnight UTC.'));
    console.log(chalk.dim('  Upgrade at https://console.groq.com for higher limits.'));
    console.log();
  });

// ── stacker login ─────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate with Stacker AI services')
  .option('--token <token>', 'Store a token directly without opening a browser')
  .action(async (cmdOptions) => {
    const { loginCommand } = await import('./commands/login');
    try {
      await loginCommand(cmdOptions.token);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ── stacker logout ────────────────────────────────────────────────
program
  .command('logout')
  .description('Remove stored authentication token')
  .action(async () => {
    const { logoutCommand } = await import('./commands/login');
    try {
      await logoutCommand();
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ── Default: no command ──────────────────────────────────────────
program.on('command:*', () => {
  logger.error(`Unknown command: ${program.args.join(' ')}`);
  program.help();
});

function applyGlobalOptions(config: ReturnType<typeof loadConfig>): void {
  const opts = program.opts();
  if (opts.verbose) config.verbose = true;
  if (opts.skipAi) config.skipAI = true;
  if (opts.noCache) config.cacheEnabled = false;
  logger.configure({ verbose: config.verbose });
}

function printComparison(
  name1: string,
  name2: string,
  stack1: ReturnType<typeof detectStack>,
  stack2: ReturnType<typeof detectStack>,
  stats1: Awaited<ReturnType<typeof analyzeRepository>>,
  stats2: Awaited<ReturnType<typeof analyzeRepository>>
): void {
  const col = (v: string) => v.padEnd(28);
  const header = (title: string) => {
    console.log(chalk.bold.blue(`  ── ${title} `).padEnd(68, '─'));
    console.log();
  };

  header('STACK COMPARISON');
  console.log(`  ${''.padEnd(24)}${chalk.bold(col(name1))}${chalk.bold(name2)}`);
  console.log(chalk.dim('  ' + '─'.repeat(60)));

  const row = (label: string, v1: string, v2: string) => {
    const diff = v1 !== v2 ? chalk.yellow(' ◄') : '';
    console.log(`  ${chalk.dim(label.padEnd(22))}${col(v1)}${v2}${diff}`);
  };

  row('Language', stack1.language, stack2.language);
  row('Project Type', stack1.projectType, stack2.projectType);
  row('Frontend', stack1.frontend.join(', ') || 'None', stack2.frontend.join(', ') || 'None');
  row('Backend', stack1.backend.join(', ') || 'None', stack2.backend.join(', ') || 'None');
  row('Database', stack1.databases.join(', ') || 'None', stack2.databases.join(', ') || 'None');
  row('Styling', stack1.styling.join(', ') || 'None', stack2.styling.join(', ') || 'None');
  row('TypeScript', stack1.hasTypeScript ? 'Yes' : 'No', stack2.hasTypeScript ? 'Yes' : 'No');
  row('Docker', stack1.hasDocker ? 'Yes' : 'No', stack2.hasDocker ? 'Yes' : 'No');
  row('CI/CD', stack1.hasCI ? 'Yes' : 'No', stack2.hasCI ? 'Yes' : 'No');

  console.log();
  header('STATS COMPARISON');
  console.log(`  ${''.padEnd(24)}${chalk.bold(col(name1))}${chalk.bold(name2)}`);
  console.log(chalk.dim('  ' + '─'.repeat(60)));

  row('Files', String(stats1.fileCount), String(stats2.fileCount));
  row('Lines of Code', stats1.lineCount.toLocaleString(), stats2.lineCount.toLocaleString());
  row('Components', String(stats1.componentCount), String(stats2.componentCount));
  row('API Routes', String(stats1.apiRouteCount), String(stats2.apiRouteCount));
  row('Test Files', String(stats1.testFileCount), String(stats2.testFileCount));
  console.log();
  console.log(chalk.dim('  ◄ = values differ between repos'));
  console.log();
}

if (process.argv.length < 3) {
  printWelcomeUI();
  process.exit(0);
}

program.parse(process.argv);
