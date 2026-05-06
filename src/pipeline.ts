import ora from 'ora';
import chalk from 'chalk';
import * as crypto from 'crypto';
import { resolveRepository } from './repoCloner';
import { analyzeRepository } from './analyzer';
import { detectStack } from './stackDetector';
import { runRuleEngine, formatRuleFindingsForLLM } from './ruleEngine';
import { mapArchitecture } from './architectureMapper';
import { buildProjectSummary } from './llm/promptBuilder';
import { runAnalysisModel, AuthError } from './llm/analysisModel';
import { runReasoningModel } from './llm/reasoningModel';
import { runSecurityModel } from './llm/securityModel';
import { runDeploymentModel } from './llm/deploymentModel';
import { RateLimitError } from './rateLimiter';
import { mergeResults, printTerminalReport, printSecurityReport, printDeploymentReport, printCodebaseReport, printBanner, exportReport, StackerReport } from './reportGenerator';
import { StackerConfig } from './config';
import { Cache } from './cache';
import { logger } from './logger';
import { auditLog, validateRepoTarget, validateSecureConfig, checkCachePermissions } from './security';

export type PipelineMode = 'stack' | 'security' | 'deployment' | 'codebase';

export interface PipelineOptions {
  target: string;
  config: StackerConfig;
  outputPath?: string;
  outputFormat?: 'terminal' | 'json' | 'markdown';
  watch?: boolean;
  mode?: PipelineMode;
}

interface PipelineSpinner {
  text: string;
  start(text?: string): PipelineSpinner;
  succeed(text?: string): PipelineSpinner;
  fail(text?: string): PipelineSpinner;
  warn(text?: string): PipelineSpinner;
  stop(): PipelineSpinner;
}

export function shouldPrintTerminalOutput(
  format: PipelineOptions['outputFormat'] | StackerConfig['outputFormat'] | undefined,
  outputPath: string | undefined
): boolean {
  return format === 'terminal' && !outputPath;
}

export async function runPipeline(options: PipelineOptions): Promise<StackerReport> {
  const { target, config } = options;
  const mode: PipelineMode = options.mode || 'stack';
  const cache = new Cache(config.cacheDir, config.cacheEnabled);
  const format = options.outputFormat || config.outputFormat;
  const printTerminal = shouldPrintTerminalOutput(format, options.outputPath);

  logger.configure({ verbose: printTerminal && config.verbose, level: printTerminal ? 'info' : 'warn' });

  // Print banner immediately — before pipeline steps
  if (printTerminal) printBanner();

  // CM-6: Validate config before doing anything
  const configErrors = validateSecureConfig(config);
  if (configErrors.length > 0) {
    for (const e of configErrors) logger.warn(e);
  }

  // SI-10: Validate repository target
  validateRepoTarget(target);

  // SC-28: Check cache dir permissions
  checkCachePermissions(config.cacheDir);

  auditLog({ action: 'analysis_start', outcome: 'success', detail: `target=${target}` });

  const modeLabel = mode === 'security' ? 'Security Analysis Pipeline'
    : mode === 'deployment' ? 'Deployment Analysis Pipeline'
    : mode === 'codebase' ? 'Comprehensive Codebase Pipeline'
    : 'Stack Analysis Pipeline';

  if (printTerminal) {
    console.log(chalk.bold.blue('  Stacker') + chalk.dim(` — ${modeLabel}`));
    console.log(chalk.dim('  ' + '─'.repeat(50)));
    console.log();
  }

  const extraAISteps = mode === 'codebase' ? 2 : (mode === 'security' || mode === 'deployment') ? 1 : 0;
  const totalSteps = config.skipAI ? 5 : 7 + extraAISteps;
  let step = 0;

  // ── Step 1: Resolve repository ─────────────────────────────────
  const spinner: PipelineSpinner = printTerminal
    ? ora({ text: 'Resolving repository...', prefixText: '  ' }).start()
    : createSilentSpinner();
  step++;

  let cloneResult: Awaited<ReturnType<typeof resolveRepository>>;
  try {
    cloneResult = await resolveRepository(target, msg => {
      spinner.text = msg;
    });
    spinner.succeed(chalk.green(`Repository resolved: ${chalk.bold(cloneResult.repoName)}`));
  } catch (err) {
    spinner.fail(`Failed to resolve repository: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  const { repoPath, cleanupFn } = cloneResult;

  try {
    // ── Step 2: Static analysis ──────────────────────────────────
    spinner.start('Running static analysis...');
    step++;

    const [stats, stack] = await Promise.all([
      analyzeRepository(repoPath, { skipAudit: config.skipAI }),
      Promise.resolve(detectStack(repoPath))
    ]);

    spinner.succeed(`Static analysis complete  ${chalk.dim(`(${stats.fileCount} files, ${stats.lineCount.toLocaleString()} lines)`)}`);
    logger.debug('Stack detected', JSON.stringify(stack, null, 2));

    // ── Step 3: Architecture mapping ─────────────────────────────
    spinner.start('Mapping architecture...');
    step++;

    const architecture = mapArchitecture(stack, stats, repoPath);
    spinner.succeed(`Architecture mapped  ${chalk.dim(`(${architecture.patterns.join(', ')})`)} `);

    // ── Step 4: Build project summary ────────────────────────────
    spinner.start('Building project summary...');
    step++;

    const projectSummary = buildProjectSummary({
      stack,
      fileCount: stats.fileCount,
      componentCount: stats.componentCount,
      apiRouteCount: stats.apiRouteCount,
      repoPath
    });

    spinner.succeed('Project summary built');
    logger.debug('Project summary:\n' + projectSummary);

    // ── Step 5: Rule engine ───────────────────────────────────────
    spinner.start('Running rule engine...');
    step++;

    const ruleResults = runRuleEngine(stack, stats.componentCount, stats.apiRouteCount, stats.fileCount, stats.testFileCount);
    spinner.succeed(
      `Rule engine complete  ${chalk.dim(
        `(${ruleResults.criticalCount} critical, ${ruleResults.warningCount} warnings, ${ruleResults.infoCount} info)`
      )}`
    );

    // ── Step 6: Analysis model ────────────────────────────────────
    let analysisResult = null;
    let reasoning = null;

    // Cache key based on project summary hash — computed once, reused across all AI steps
    const summaryHash = crypto.createHash('sha256').update(projectSummary).digest('hex').slice(0, 16);

    if (!config.skipAI) {
      const analysisCacheKey = Cache.buildKey('analysis', config.analysisModel, summaryHash);

      spinner.start(`Running analysis model (${config.analysisModel})...`);
      step++;

      analysisResult = cache.get<object>(analysisCacheKey);
      if (analysisResult) {
        spinner.succeed(`Analysis model complete  ${chalk.dim('(cached)')}`);
      } else {
        try {
          analysisResult = await withRetry(
            () => runAnalysisModel(projectSummary, {
              projectType: stack.projectType,
              hasTypeScript: stack.hasTypeScript,
              testFileCount: stats.testFileCount
            }),
            config.retries,
            (attempt) => { spinner.text = `Running analysis model (attempt ${attempt + 1}/${config.retries + 1})...`; }
          );
          cache.set(analysisCacheKey, analysisResult);
          spinner.succeed(`Analysis model complete  ${chalk.dim(`(${config.analysisModel})`)}`);
        } catch (err) {
          if (err instanceof AuthError) {
            spinner.stop();
            if (printTerminal) console.log(chalk.yellow('\n  ✘ Not authenticated. Run: stacker login\n'));
            logger.info('Continuing with rule-based analysis only.');
          } else if (err instanceof RateLimitError) {
            spinner.stop();
            if (printTerminal) console.log('\n' + chalk.yellow(err.message) + '\n');
            logger.info('Continuing with rule-based analysis only.');
          } else {
            spinner.warn(`Analysis model failed: ${err instanceof Error ? err.message : String(err)}. Proceeding with rule-based analysis only.`);
            logger.debug('Analysis model error', err);
          }
        }
      }

      // ── Step 7: Reasoning model ─────────────────────────────────
      const ruleFindings = formatRuleFindingsForLLM(ruleResults);
      const analysisStr = analysisResult ? JSON.stringify(analysisResult) : 'Analysis model unavailable.';
      const reasoningCacheKey = Cache.buildKey('reasoning', config.reasoningModel, summaryHash);

      spinner.start(`Running reasoning model (${config.reasoningModel})...`);
      step++;

      reasoning = cache.get<typeof reasoning>(reasoningCacheKey);
      if (reasoning) {
        spinner.succeed(`Reasoning model complete  ${chalk.dim('(cached)')}`);
      } else {
        try {
          const analysisProjectContext = analysisResult && typeof (analysisResult as any).projectContext === 'string'
            ? (analysisResult as any).projectContext
            : undefined;
          reasoning = await withRetry(
            () => runReasoningModel(projectSummary, analysisStr, ruleFindings, {
              projectType: stack.projectType,
              hasTypeScript: stack.hasTypeScript,
              testFileCount: stats.testFileCount,
              projectContext: analysisProjectContext
            }),
            config.retries,
            (attempt) => { spinner.text = `Running reasoning model (attempt ${attempt + 1}/${config.retries + 1})...`; }
          );
          cache.set(reasoningCacheKey, reasoning);
          spinner.succeed(`Reasoning model complete  ${chalk.dim(`(${config.reasoningModel})`)}`);
        } catch (err) {
          if (err instanceof AuthError) {
            spinner.stop();
            if (printTerminal) console.log(chalk.yellow('\n  ✘ Not authenticated. Run: stacker login\n'));
            logger.info('Report will use rule-based results only.');
          } else if (err instanceof RateLimitError) {
            spinner.stop();
            if (printTerminal) console.log('\n' + chalk.yellow(err.message) + '\n');
            logger.info('Report will use rule-based results only.');
          } else {
            spinner.warn(`Reasoning model failed: ${err instanceof Error ? err.message : String(err)}. Report will use rule-based results only.`);
            logger.debug('Reasoning model error', err);
          }
        }
      }
    } else {
      logger.info('AI analysis skipped (--skip-ai flag)');
    }

    // ── Merge and build final report ──────────────────────────────
    const merged = mergeResults(ruleResults, reasoning);

    // ── Security model (if security or codebase mode) ─────────────
    let securityFindings: import('./prompts/securityPrompt').SecurityFindings | undefined = undefined;
    if (!config.skipAI && (mode === 'security' || mode === 'codebase')) {
      const secCacheKey = Cache.buildKey('security', config.analysisModel, summaryHash);

      spinner.start('Running security analysis...');
      step++;

      const cachedSec = cache.get<import('./prompts/securityPrompt').SecurityFindings>(secCacheKey);
      if (cachedSec) {
        securityFindings = cachedSec;
        spinner.succeed(`Security analysis complete  ${chalk.dim('(cached)')}`);
      } else {
        try {
          securityFindings = await withRetry(
            () => runSecurityModel(projectSummary, {
              projectType: stack.projectType,
              hasTypeScript: stack.hasTypeScript,
              hasDocker: stack.hasDocker,
              hasCI: stack.hasCI,
              testFileCount: stats.testFileCount,
              vulnerabilities: stats.vulnerabilities,
              secretFindingsCount: stats.secretFindings?.findings.length,
              highComplexityFiles: stats.complexity?.highComplexityFiles
            }),
            config.retries,
            (attempt) => { spinner.text = `Running security analysis (attempt ${attempt + 1}/${config.retries + 1})...`; }
          );
          cache.set(secCacheKey, securityFindings);
          spinner.succeed(`Security analysis complete  ${chalk.dim(`(${config.analysisModel})`)}`);
        } catch (err) {
          if (err instanceof AuthError) {
            spinner.stop();
            if (printTerminal) console.log(chalk.yellow('\n  ✘ Not authenticated. Run: stacker login\n'));
          } else if (err instanceof RateLimitError) {
            spinner.stop();
            if (printTerminal) console.log('\n' + chalk.yellow((err as Error).message) + '\n');
          } else {
            spinner.warn(`Security analysis failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    // ── Deployment model (if deployment or codebase mode) ─────────
    let deploymentRecommendations: import('./prompts/deploymentPrompt').DeploymentRecommendations | undefined = undefined;
    if (!config.skipAI && (mode === 'deployment' || mode === 'codebase')) {
      const depCacheKey = Cache.buildKey('deployment', config.analysisModel, summaryHash);

      spinner.start('Running deployment analysis...');
      step++;

      const cachedDep = cache.get<import('./prompts/deploymentPrompt').DeploymentRecommendations>(depCacheKey);
      if (cachedDep) {
        deploymentRecommendations = cachedDep;
        spinner.succeed(`Deployment analysis complete  ${chalk.dim('(cached)')}`);
      } else {
        try {
          deploymentRecommendations = await withRetry(
            () => runDeploymentModel(projectSummary, {
              projectType: stack.projectType,
              hasTypeScript: stack.hasTypeScript,
              hasDocker: stack.hasDocker,
              hasCI: stack.hasCI,
              testFileCount: stats.testFileCount,
              fileCount: stats.fileCount
            }),
            config.retries,
            (attempt) => { spinner.text = `Running deployment analysis (attempt ${attempt + 1}/${config.retries + 1})...`; }
          );
          cache.set(depCacheKey, deploymentRecommendations);
          spinner.succeed(`Deployment analysis complete  ${chalk.dim(`(${config.analysisModel})`)}`);
        } catch (err) {
          if (err instanceof AuthError) {
            spinner.stop();
            if (printTerminal) console.log(chalk.yellow('\n  ✘ Not authenticated. Run: stacker login\n'));
          } else if (err instanceof RateLimitError) {
            spinner.stop();
            if (printTerminal) console.log('\n' + chalk.yellow((err as Error).message) + '\n');
          } else {
            spinner.warn(`Deployment analysis failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    const report: StackerReport = {
      repoName: cloneResult.repoName,
      analyzedAt: new Date().toISOString(),
      stack,
      stats,
      architecture,
      ruleResults,
      reasoning,
      merged,
      mode,
      securityFindings,
      deploymentRecommendations
    };

    // ── Output ─────────────────────────────────────────────────────
    if (printTerminal) {
      if (mode === 'security' && securityFindings) {
        console.log(chalk.dim(`  Security Report  •  ${report.analyzedAt}`));
        console.log(chalk.dim(`  Repository: ${report.repoName}`));
        console.log();
        printSecurityReport(securityFindings);
      } else if (mode === 'deployment' && deploymentRecommendations) {
        console.log(chalk.dim(`  Deployment Report  •  ${report.analyzedAt}`));
        console.log(chalk.dim(`  Repository: ${report.repoName}`));
        console.log();
        printDeploymentReport(deploymentRecommendations);
      } else if (mode === 'codebase') {
        printCodebaseReport(report);
      } else {
        printTerminalReport(report);
      }
    }

    if (options.outputPath) {
      const fmt = options.outputPath.endsWith('.md') ? 'markdown' : 'json';
      exportReport(report, fmt, options.outputPath);
      logger.success(`Report saved to ${options.outputPath}`);
    } else if (format === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else if (format === 'markdown') {
      const { renderReport } = await import('./reportGenerator');
      console.log(renderReport(report, 'markdown'));
    }

    return report;

  } finally {
    cleanupFn();
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  onRetry?: (attempt: number) => void
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        onRetry?.(attempt);
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createSilentSpinner(): PipelineSpinner {
  return {
    text: '',
    start(text?: string) {
      if (text) this.text = text;
      return this;
    },
    succeed() { return this; },
    fail() { return this; },
    warn() { return this; },
    stop() { return this; }
  };
}
