import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { DetectedStack } from './stackDetector';
import { AnalyzerStats, VulnerabilityStats } from './analyzer';
import { SecretScanResult } from './secretScanner';
import { ComplexityMetrics } from './complexityAnalyzer';
import { RuleEngineResult } from './ruleEngine';
import { ReasoningResult } from './llm/reasoningModel';
import { ArchitectureMap } from './architectureMapper';
import { SecurityFindings } from './prompts/securityPrompt';
import { DeploymentRecommendations } from './prompts/deploymentPrompt';

export { SecurityFindings, DeploymentRecommendations };

export interface StackerReport {
  repoName: string;
  analyzedAt: string;
  stack: DetectedStack;
  stats: AnalyzerStats;
  architecture: ArchitectureMap;
  ruleResults: RuleEngineResult;
  reasoning: ReasoningResult | null;
  merged: MergedSuggestion[];
  mode?: 'stack' | 'security' | 'deployment' | 'codebase';
  securityFindings?: SecurityFindings;
  deploymentRecommendations?: DeploymentRecommendations;
}

export interface MergedSuggestion {
  id: string;
  source: 'rule' | 'ai' | 'both';
  category: string;
  current: string;
  suggested: string;
  reason: string;
  benefit: string;
  tradeoffs?: string;
  alternatives?: string;
  migrationNotes?: string;
  priority: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  severity?: 'info' | 'warning' | 'critical';
  tags?: string[];
}

export function mergeResults(ruleResults: RuleEngineResult, reasoning: ReasoningResult | null): MergedSuggestion[] {
  const merged: MergedSuggestion[] = [];

  // Add all rule findings
  for (const [i, f] of ruleResults.findings.entries()) {
    merged.push({
      id: f.ruleId,
      source: 'rule',
      category: f.category,
      current: f.current,
      suggested: f.suggested,
      reason: f.reason,
      benefit: f.benefit,
      priority: f.priority,
      effort: f.effort,
      severity: f.severity,
      tags: f.tags
    });
  }

  // Add AI suggestions that don't duplicate rule findings
  if (reasoning) {
    for (const [i, s] of reasoning.suggestions.entries()) {
      const categoryKey = s.category.toLowerCase().trim();
      const currentKey = s.current.toLowerCase().trim();
      const suggestedKey = s.suggested.toLowerCase().trim();

      const isDuplicate = merged.some(m =>
        m.category.toLowerCase().trim() === categoryKey ||
        (m.current.toLowerCase().trim() === currentKey &&
          m.suggested.toLowerCase().trim() === suggestedKey)
      );

      if (isDuplicate) {
        // Mark all exact category matches as 'both'
        for (const m of merged) {
          if (m.category.toLowerCase().trim() === categoryKey) m.source = 'both';
        }
        continue;
      }

      merged.push({
        id: `AI_${String(i + 1).padStart(3, '0')}`,
        source: 'ai',
        category: s.category,
        current: s.current,
        suggested: s.suggested,
        reason: s.reason,
        benefit: s.benefit,
        tradeoffs: s.tradeoffs,
        alternatives: s.alternatives,
        migrationNotes: s.migrationNotes,
        priority: s.priority,
        effort: s.effort
      });
    }
  }

  // Sort: high priority first
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  merged.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return merged;
}

export function printBanner(): void {
  console.log();
  console.log(chalk.bold.bgBlue.white('  ███████╗████████╗ █████╗  ██████╗██╗  ██╗███████╗██████╗  '));
  console.log(chalk.bold.bgBlue.white('  ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗ '));
  console.log(chalk.bold.bgBlue.white('  ███████╗   ██║   ███████║██║     █████╔╝ █████╗  ██████╔╝ '));
  console.log(chalk.bold.bgBlue.white('  ╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗ '));
  console.log(chalk.bold.bgBlue.white('  ███████║   ██║   ██║  ██║╚██████╗██║  ██╗███████╗██║  ██║ '));
  console.log(chalk.bold.bgBlue.white('  ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝'));
  console.log();
}

export function printTerminalReport(report: StackerReport): void {
  const { repoName, stack, stats, architecture, ruleResults, reasoning, merged } = report;

  console.log(chalk.dim(`  Stack Analysis Report  •  ${report.analyzedAt}`));
  console.log(chalk.dim(`  Repository: ${repoName}`));
  console.log();

  // ── DETECTED STACK ──────────────────────────────────────────────
  printSection('DETECTED STACK');

  printRow('Language', stack.language + (stack.hasTypeScript ? ' (TypeScript)' : ''));
  printRow('Project Type', stack.projectType);
  if (stack.frontend.length) printRow('Frontend', stack.frontend.join(', '));
  if (stack.backend.length) printRow('Backend', stack.backend.join(', '));
  if (stack.databases.length) printRow('Database', stack.databases.join(', '));
  if (stack.styling.length) printRow('Styling', stack.styling.join(', '));
  if (stack.testing.length) printRow('Testing', stack.testing.join(', '));
  if (stack.buildTools.length) printRow('Build Tools', stack.buildTools.join(', '));
  if (stack.packageManager) printRow('Package Manager', stack.packageManager);

  console.log();

  // ── REPOSITORY STATS ────────────────────────────────────────────
  printSection('REPOSITORY STATS');

  printRow('Files', String(stats.fileCount));
  printRow('Lines of Code', stats.lineCount.toLocaleString());
  printRow('Components', String(stats.componentCount));
  printRow('API Routes', String(stats.apiRouteCount));
  printRow('Test Files', String(stats.testFileCount));
  printRow('Architecture', architecture.patterns.join(', ') || 'Unknown');
  printRow('Docker', stack.hasDocker ? chalk.green('Yes') : chalk.red('No'));
  printRow('CI/CD', stack.hasCI ? chalk.green('Yes') : chalk.red('No'));
  console.log();

  // ── DEPENDENCY VULNERABILITIES ────────────────────────────────────
  if (stats.vulnerabilities && stats.vulnerabilities.total > 0) {
    printSection('DEPENDENCY VULNERABILITIES');
    const v = stats.vulnerabilities;
    const parts: string[] = [];
    if (v.critical > 0) parts.push(chalk.red.bold(`${v.critical} critical`));
    if (v.high > 0) parts.push(chalk.yellow(`${v.high} high`));
    if (v.moderate > 0) parts.push(chalk.dim(chalk.yellow(`${v.moderate} moderate`)));
    if (v.low > 0) parts.push(chalk.dim(`${v.low} low`));
    console.log('  ' + parts.join('  '));
    console.log();
    const topAdvisories = v.advisories.slice(0, 5);
    for (const adv of topAdvisories) {
      const sevColor = adv.severity === 'critical' ? chalk.red
        : adv.severity === 'high' ? chalk.yellow
        : chalk.dim;
      console.log(`  ${sevColor('•')} ${chalk.bold(adv.name)}  ${sevColor(adv.severity)}  ${chalk.dim(adv.title)}`);
    }
    if (v.advisories.length > 5) {
      console.log(chalk.dim(`  ... and ${v.advisories.length - 5} more`));
    }
    console.log();
  }

  // ── SECRETS FOUND ─────────────────────────────────────────────────
  if (stats.secretFindings && stats.secretFindings.findings.length > 0) {
    const sf = stats.secretFindings;
    printSection('SECRETS FOUND');
    console.log(`  ${chalk.yellow('⚠')} ${chalk.bold(`${sf.findings.length} potential secrets detected`)}`);
    console.log();
    const topFindings = sf.findings.slice(0, 10);
    for (const f of topFindings) {
      const sevColor = f.severity === 'critical' ? chalk.red
        : f.severity === 'high' ? chalk.yellow
        : chalk.dim;
      console.log(`  ${sevColor('•')} ${chalk.dim(f.file + ':' + f.line)}  —  ${sevColor(f.type)}  —  ${chalk.dim(f.match)}`);
    }
    if (sf.findings.length > 10) {
      console.log(chalk.dim(`  ... and ${sf.findings.length - 10} more`));
    }
    console.log();
  }

  // ── CODE COMPLEXITY ───────────────────────────────────────────────
  if (stats.complexity) {
    const cx = stats.complexity;
    printSection('CODE COMPLEXITY');
    printRow('Average complexity', String(cx.averageComplexity));
    printRow('Max complexity', String(cx.maxComplexity));
    printRow('Total functions', String(cx.totalFunctions));
    printRow('Avg lines/function', cx.linesPerFunction > 0 ? String(cx.linesPerFunction) : 'N/A');
    const dupColor = cx.duplicationRisk === 'high' ? chalk.red
      : cx.duplicationRisk === 'medium' ? chalk.yellow
      : chalk.green;
    printRow('Duplication risk', dupColor(cx.duplicationRisk));
    if (typeof cx.testFilesExcluded === 'number' && cx.testFilesExcluded > 0) {
      console.log(`  ${chalk.dim(`(${cx.testFilesExcluded} test file(s) excluded from metrics)`)}`);
    }
    if (cx.highComplexityFiles.length > 0) {
      console.log();
      console.log(chalk.dim('  High complexity files:'));
      for (const f of cx.highComplexityFiles.slice(0, 5)) {
        console.log(`    ${chalk.yellow('•')} ${chalk.dim(f.file)}  ${chalk.yellow(`complexity: ${f.complexity}`)}`);
      }
    }
    console.log();
  }

  // ── RULE ENGINE FINDINGS ─────────────────────────────────────────
  printSection(`RULE ENGINE  •  ${ruleResults.totalFindings} findings`);

  if (ruleResults.criticalCount > 0) {
    console.log(`  ${chalk.bgRed.white(` ${ruleResults.criticalCount} CRITICAL `)}  ${chalk.yellow(`${ruleResults.warningCount} warnings`)}  ${chalk.cyan(`${ruleResults.infoCount} info`)}`);
  } else if (ruleResults.warningCount > 0) {
    console.log(`  ${chalk.bgYellow.black(` ${ruleResults.warningCount} WARNINGS `)}  ${chalk.cyan(`${ruleResults.infoCount} info`)}`);
  } else {
    console.log(`  ${chalk.green('No critical issues found.')}  ${chalk.cyan(`${ruleResults.infoCount} info`)}`);
  }
  console.log();

  // ── STACK SCORES ─────────────────────────────────────────────────
  if (reasoning?.scores) {
    printSection('STACK SCORES');

    const cur = reasoning.scores.current;
    const opt = reasoning.scores.optimized;

    printScoreRow('Overall', cur.overall, opt.overall);
    printScoreRow('Performance', cur.performance, opt.performance);
    printScoreRow('Developer Experience', cur.developerExperience, opt.developerExperience);
    printScoreRow('Maintainability', cur.maintainability, opt.maintainability);
    printScoreRow('Scalability', cur.scalability, opt.scalability);
    console.log();
  }

  // ── SUGGESTIONS ───────────────────────────────────────────────────
  if (merged.length > 0) {
    printSection(`SUGGESTED IMPROVEMENTS  •  ${merged.length} total`);
    console.log();

    for (const [i, s] of merged.entries()) {
      printSuggestion(i + 1, s);
    }
  } else {
    printSection('SUGGESTED IMPROVEMENTS');
    if (reasoning) {
      console.log(`  ${chalk.green('✓ Your stack looks well-optimized for its current architecture.')}`);
      console.log(`  ${chalk.dim('Both the rule engine and AI analysis found no improvements needed.')}`);
    } else {
      console.log(`  ${chalk.green('✓ No rule-based issues detected.')}`);
      console.log(`  ${chalk.dim('  Run with AI enabled for deeper recommendations.')}`);
    }
    console.log();
  }

  // ── STRENGTHS ────────────────────────────────────────────────────
  if (reasoning?.strengths?.length) {
    printSection('STACK STRENGTHS');
    for (const s of reasoning.strengths) {
      console.log(`  ${chalk.green('✓')} ${s}`);
    }
    console.log();
  }

  // ── AI SUMMARY ───────────────────────────────────────────────────
  if (reasoning?.summary) {
    printSection('ANALYSIS SUMMARY');
    const summary = wrapText(reasoning.summary, 70, 2);
    console.log(`  ${chalk.italic(summary)}`);
    console.log();
  }

  // ── SCALABILITY & COMPLEXITY ─────────────────────────────────────
  if (architecture.scalabilitySignals.length > 0) {
    console.log(chalk.bold.green('  ✓ Scalability signals detected:'));
    for (const signal of architecture.scalabilitySignals) {
      console.log(`    ${chalk.green('•')} ${signal}`);
    }
    console.log();
  }

  if (architecture.complexitySignals.length > 0) {
    console.log(chalk.bold.yellow('  ⚠ Complexity/risk signals:'));
    for (const signal of architecture.complexitySignals) {
      console.log(`    ${chalk.yellow('•')} ${signal}`);
    }
    console.log();
  }

  console.log(chalk.dim('─'.repeat(64)));
  console.log(chalk.dim('  Generated by Stacker  •  github.com/stacked0001/Stacker'));
  console.log();
}

export function exportReport(report: StackerReport, format: 'json' | 'markdown', outputPath: string): void {
  // Security: prevent path traversal — resolve and ensure it stays within CWD or an absolute path the user explicitly provided
  const resolved = path.resolve(outputPath);
  const resolvedDir = path.dirname(resolved);
  try {
    fs.mkdirSync(resolvedDir, { recursive: true });
  } catch {
    throw new Error(`Cannot create output directory: ${resolvedDir}`);
  }

  if (format === 'json') {
    fs.writeFileSync(resolved, JSON.stringify(report, null, 2), 'utf-8');
    return;
  }

  if (format === 'markdown') {
    const md = generateMarkdownReport(report);
    fs.writeFileSync(resolved, md, 'utf-8');
  }
}

function generateMarkdownReport(report: StackerReport): string {
  const { repoName, stack, stats, architecture, merged, reasoning, securityFindings, deploymentRecommendations } = report;
  const lines: string[] = [];

  lines.push(`# Stacker Report — ${repoName}`);
  lines.push(`> Generated at ${report.analyzedAt}`);
  lines.push('');
  lines.push('## Detected Stack');
  lines.push('');
  lines.push(`| Property | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Language | ${stack.language} |`);
  lines.push(`| Project Type | ${stack.projectType} |`);
  if (stack.frontend.length) lines.push(`| Frontend | ${stack.frontend.join(', ')} |`);
  if (stack.backend.length) lines.push(`| Backend | ${stack.backend.join(', ')} |`);
  if (stack.databases.length) lines.push(`| Database | ${stack.databases.join(', ')} |`);
  if (stack.styling.length) lines.push(`| Styling | ${stack.styling.join(', ')} |`);
  if (stack.testing.length) lines.push(`| Testing | ${stack.testing.join(', ')} |`);
  lines.push(`| Architecture | ${architecture.patterns.join(', ')} |`);
  lines.push(`| Docker | ${stack.hasDocker ? 'Yes' : 'No'} |`);
  lines.push(`| CI/CD | ${stack.hasCI ? 'Yes' : 'No'} |`);
  lines.push('');

  lines.push('## Repository Stats');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Files | ${stats.fileCount} |`);
  lines.push(`| Lines of Code | ${stats.lineCount.toLocaleString()} |`);
  lines.push(`| Components | ${stats.componentCount} |`);
  lines.push(`| API Routes | ${stats.apiRouteCount} |`);
  lines.push(`| Test Files | ${stats.testFileCount} |`);
  lines.push('');

  // ── Dependency Vulnerabilities ────────────────────────────────
  if (stats.vulnerabilities && stats.vulnerabilities.total > 0) {
    const v = stats.vulnerabilities;
    lines.push('## Dependency Vulnerabilities');
    lines.push('');
    lines.push(`| Severity | Count |`);
    lines.push(`|---|---|`);
    if (v.critical > 0) lines.push(`| Critical | ${v.critical} |`);
    if (v.high > 0) lines.push(`| High | ${v.high} |`);
    if (v.moderate > 0) lines.push(`| Moderate | ${v.moderate} |`);
    if (v.low > 0) lines.push(`| Low | ${v.low} |`);
    lines.push('');
    if (v.advisories.length > 0) {
      for (const adv of v.advisories.slice(0, 10)) {
        lines.push(`- **${adv.name}** (${adv.severity}): ${adv.title}`);
      }
      lines.push('');
    }
  }

  // ── Secrets Found ─────────────────────────────────────────────
  if (stats.secretFindings && stats.secretFindings.findings.length > 0) {
    const sf = stats.secretFindings;
    lines.push('## Secrets Found');
    lines.push('');
    lines.push(`> ${sf.findings.length} potential secret(s) detected`);
    lines.push('');
    for (const f of sf.findings.slice(0, 20)) {
      lines.push(`- **${f.type}** (${f.severity}) — \`${f.file}:${f.line}\` — ${f.match}`);
    }
    if (sf.findings.length > 20) lines.push(`- ... and ${sf.findings.length - 20} more`);
    lines.push('');
  }

  // ── Code Complexity ───────────────────────────────────────────
  if (stats.complexity) {
    const cx = stats.complexity;
    lines.push('## Code Complexity');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Average Complexity | ${cx.averageComplexity} |`);
    lines.push(`| Max Complexity | ${cx.maxComplexity} |`);
    lines.push(`| Total Functions | ${cx.totalFunctions} |`);
    lines.push(`| Avg Lines/Function | ${cx.linesPerFunction > 0 ? cx.linesPerFunction : 'N/A'} |`);
    lines.push(`| Duplication Risk | ${cx.duplicationRisk} |`);
    if (typeof cx.testFilesExcluded === 'number' && cx.testFilesExcluded > 0) {
      lines.push('');
      lines.push(`> Note: ${cx.testFilesExcluded} test file(s) excluded from complexity metrics.`);
    }
    if (cx.highComplexityFiles.length > 0) {
      lines.push('');
      lines.push('**High complexity files:**');
      for (const f of cx.highComplexityFiles.slice(0, 10)) {
        lines.push(`- \`${f.file}\` — complexity: ${f.complexity}`);
      }
    }
    lines.push('');
  }

  if (reasoning?.scores) {
    lines.push('## Stack Scores');
    lines.push('');
    lines.push(`| Dimension | Current | Optimized |`);
    lines.push(`|---|---|---|`);
    const c = reasoning.scores.current;
    const o = reasoning.scores.optimized;
    lines.push(`| Overall | ${c.overall}/10 | ${o.overall}/10 |`);
    lines.push(`| Performance | ${c.performance}/10 | ${o.performance}/10 |`);
    lines.push(`| Developer Experience | ${c.developerExperience}/10 | ${o.developerExperience}/10 |`);
    lines.push(`| Maintainability | ${c.maintainability}/10 | ${o.maintainability}/10 |`);
    lines.push(`| Scalability | ${c.scalability}/10 | ${o.scalability}/10 |`);
    lines.push('');
  }

  if (merged.length > 0) {
    lines.push('## Suggested Improvements');
    lines.push('');
    for (const [i, s] of merged.entries()) {
      lines.push(`### ${i + 1}. ${s.category}`);
      lines.push('');
      lines.push(`- **Current:** ${s.current}`);
      lines.push(`- **Suggested:** ${s.suggested}`);
      lines.push(`- **Priority:** ${s.priority}`);
      lines.push(`- **Effort:** ${s.effort}`);
      lines.push(`- **Source:** ${s.source}`);
      lines.push('');
      lines.push(`**Reason:** ${s.reason}`);
      lines.push('');
      lines.push(`**Benefit:** ${s.benefit}`);
      if (s.tradeoffs) { lines.push(''); lines.push(`**Tradeoffs:** ${s.tradeoffs}`); }
      if (s.migrationNotes) { lines.push(''); lines.push(`**Getting started:** ${s.migrationNotes}`); }
      lines.push('');
    }
  }

  if (reasoning?.summary) {
    lines.push('## AI Analysis Summary');
    lines.push('');
    lines.push(reasoning.summary);
    lines.push('');
  }

  // ── Security Findings ─────────────────────────────────────────
  if (securityFindings) {
    lines.push('## Security Analysis');
    lines.push('');
    lines.push(`**Security Score:** ${securityFindings.score.toFixed(1)}/10`);
    lines.push('');
    if (securityFindings.summary) {
      lines.push(securityFindings.summary);
      lines.push('');
    }
    if (securityFindings.findings.length > 0) {
      for (const [i, f] of securityFindings.findings.entries()) {
        lines.push(`### ${i + 1}. ${f.title}`);
        lines.push('');
        lines.push(`- **Severity:** ${f.severity}`);
        lines.push(`- **Category:** ${f.category}`);
        lines.push(`- **Effort:** ${f.effort}`);
        lines.push('');
        lines.push(`**Description:** ${f.description}`);
        lines.push('');
        lines.push(`**Recommendation:** ${f.recommendation}`);
        if (f.references) { lines.push(''); lines.push(`**References:** ${f.references}`); }
        lines.push('');
      }
    }
    if (securityFindings.strengths.length > 0) {
      lines.push('### Security Strengths');
      lines.push('');
      for (const s of securityFindings.strengths) lines.push(`- ${s}`);
      lines.push('');
    }
  }

  // ── Deployment Recommendations ────────────────────────────────
  if (deploymentRecommendations) {
    lines.push('## Deployment Analysis');
    lines.push('');
    lines.push(`**Deployment Score:** ${deploymentRecommendations.score.toFixed(1)}/10`);
    lines.push('');
    if (deploymentRecommendations.summary) {
      lines.push(deploymentRecommendations.summary);
      lines.push('');
    }
    if (deploymentRecommendations.recommendations.length > 0) {
      for (const [i, r] of deploymentRecommendations.recommendations.entries()) {
        lines.push(`### ${i + 1}. ${r.title}`);
        lines.push('');
        lines.push(`- **Priority:** ${r.priority}`);
        lines.push(`- **Category:** ${r.category}`);
        lines.push(`- **Effort:** ${r.effort}`);
        lines.push('');
        lines.push(`**Description:** ${r.description}`);
        lines.push('');
        lines.push(`**Implementation:** ${r.implementation}`);
        if (r.impact) { lines.push(''); lines.push(`**Impact:** ${r.impact}`); }
        lines.push('');
      }
    }
    if (deploymentRecommendations.strengths.length > 0) {
      lines.push('### Deployment Strengths');
      lines.push('');
      for (const s of deploymentRecommendations.strengths) lines.push(`- ${s}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Generated by [Stacker](https://github.com/stacked0001/Stacker)*');

  return lines.join('\n');
}

function printSection(title: string): void {
  console.log(chalk.bold.blue(`  ── ${title} `).padEnd(68, '─'));
  console.log();
}

function printRow(label: string, value: string): void {
  const paddedLabel = chalk.dim(label.padEnd(22));
  console.log(`  ${paddedLabel}${value}`);
}

function printScoreRow(label: string, current: number, optimized: number): void {
  const diff = optimized - current;
  const diffStr = diff > 0 ? chalk.green(`+${diff.toFixed(1)}`) : diff < 0 ? chalk.red(diff.toFixed(1)) : chalk.dim('0');
  const currentBar = buildScoreBar(current);
  const paddedLabel = label.padEnd(26);
  console.log(`  ${chalk.dim(paddedLabel)}${chalk.yellow(current.toFixed(1))}/10  →  ${chalk.green(optimized.toFixed(1))}/10  ${diffStr}   ${currentBar}`);
}

function buildScoreBar(score: number): string {
  const filled = Math.round(score);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  if (score >= 8) return chalk.green(bar);
  if (score >= 6) return chalk.yellow(bar);
  return chalk.red(bar);
}

function printSuggestion(index: number, s: MergedSuggestion): void {
  const priorityBadge = s.priority === 'high' ? chalk.bgRed.white(' HIGH ')
    : s.priority === 'medium' ? chalk.bgYellow.black(' MED  ')
    : chalk.bgGray.white(' LOW  ');
  const effortBadge = s.effort === 'low' ? chalk.green('Low effort')
    : s.effort === 'medium' ? chalk.yellow('Medium effort')
    : chalk.red('High effort');
  const sourceBadge = s.source === 'ai' ? chalk.magenta('AI')
    : s.source === 'both' ? chalk.blue('RULE+AI')
    : chalk.cyan('RULE');

  // ── Header ──────────────────────────────────────────────────────
  console.log(`  ${chalk.bold.white(`${index}.`)}  ${chalk.bold(s.category.toUpperCase())}  ${priorityBadge}  ${chalk.dim(effortBadge)}  ${chalk.dim(sourceBadge)}`);
  console.log();

  // ── Change ───────────────────────────────────────────────────────
  console.log(`     ${chalk.dim('FROM')}  ${chalk.red(s.current)}`);
  console.log(`     ${chalk.dim('TO  ')}  ${chalk.green.bold(s.suggested)}`);
  console.log();

  // ── Problem (why current is limiting) ───────────────────────────
  console.log(`     ${chalk.yellow('◆ Problem')}`);
  console.log(`     ${chalk.dim('│')}  ${wrapText(s.reason, 58, 10)}`);
  console.log();

  // ── Outcome (what improves) ──────────────────────────────────────
  console.log(`     ${chalk.green('◆ Outcome')}`);
  console.log(`     ${chalk.dim('│')}  ${wrapText(s.benefit, 58, 10)}`);
  console.log();

  // ── Optional detail fields ───────────────────────────────────────
  if (s.tradeoffs) {
    console.log(`     ${chalk.cyan('◆ Tradeoffs')}`);
    console.log(`     ${chalk.dim('│')}  ${chalk.dim(wrapText(s.tradeoffs, 58, 10))}`);
    console.log();
  }
  if (s.alternatives) {
    console.log(`     ${chalk.dim('◆ Alternatives')}`);
    console.log(`     ${chalk.dim('│')}  ${chalk.dim(wrapText(s.alternatives, 58, 10))}`);
    console.log();
  }
  if (s.migrationNotes) {
    console.log(`     ${chalk.dim('◆ Getting started')}`);
    console.log(`     ${chalk.dim('│')}  ${chalk.dim(wrapText(s.migrationNotes, 58, 10))}`);
    console.log();
  }
  if (s.tags?.length) {
    console.log(`     ${chalk.dim('Tags  ' + s.tags.map(t => `#${t}`).join('  '))}`);
    console.log();
  }

  console.log(chalk.dim('  ╌'.repeat(30)));
  console.log();
}

function wrapText(text: string, maxWidth: number, indent: number): string {
  if (text.length <= maxWidth) return text;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + word).length > maxWidth) {
      lines.push(current.trim());
      current = word + ' ';
    } else {
      current += word + ' ';
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.join('\n' + ' '.repeat(indent));
}

export function printSecurityReport(findings: SecurityFindings): void {
  const { findings: items, score, summary, strengths } = findings;

  printSection(`SECURITY ANALYSIS  •  score: ${score.toFixed(1)}/10`);

  // Summary counts by severity
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of items) counts[f.severity]++;

  const parts: string[] = [];
  if (counts.critical > 0) parts.push(chalk.bgRed.white(` ${counts.critical} CRITICAL `));
  if (counts.high > 0) parts.push(chalk.red(`${counts.high} high`));
  if (counts.medium > 0) parts.push(chalk.yellow(`${counts.medium} medium`));
  if (counts.low > 0) parts.push(chalk.blue(`${counts.low} low`));
  if (counts.info > 0) parts.push(chalk.dim(`${counts.info} info`));
  if (parts.length === 0) parts.push(chalk.green('No issues found'));

  console.log('  ' + parts.join('  '));
  console.log();

  for (const [i, f] of items.entries()) {
    const severityBadge =
      f.severity === 'critical' ? chalk.bgRed.white(' CRITICAL ')
      : f.severity === 'high'   ? chalk.red.bold(' HIGH     ')
      : f.severity === 'medium' ? chalk.yellow(' MEDIUM   ')
      : f.severity === 'low'    ? chalk.blue(' LOW      ')
      :                           chalk.dim(' INFO     ');

    const effortBadge = f.effort === 'low' ? chalk.green('Low effort')
      : f.effort === 'medium' ? chalk.yellow('Medium effort')
      : chalk.red('High effort');

    console.log(`  ${chalk.bold.white(`${i + 1}.`)}  ${severityBadge}  ${chalk.bold(f.title)}`);
    console.log(`     ${chalk.dim('Category:')}  ${f.category}  ${chalk.dim('|')}  ${chalk.dim(effortBadge)}`);
    console.log();
    console.log(`     ${chalk.yellow('◆ Issue')}`);
    console.log(`     ${chalk.dim('│')}  ${wrapText(f.description, 58, 10)}`);
    console.log();
    console.log(`     ${chalk.green('◆ Recommendation')}`);
    console.log(`     ${chalk.dim('│')}  ${wrapText(f.recommendation, 58, 10)}`);
    console.log();
    if (f.references) {
      console.log(`     ${chalk.dim('◆ References')}`);
      console.log(`     ${chalk.dim('│')}  ${chalk.dim(wrapText(f.references, 58, 10))}`);
      console.log();
    }
    console.log(chalk.dim('  ╌'.repeat(30)));
    console.log();
  }

  if (strengths.length > 0) {
    printSection('SECURITY STRENGTHS');
    for (const s of strengths) {
      console.log(`  ${chalk.green('✓')} ${s}`);
    }
    console.log();
  }

  if (summary) {
    printSection('SECURITY SUMMARY');
    console.log(`  ${chalk.italic(wrapText(summary, 70, 2))}`);
    console.log();
  }
}

export function printDeploymentReport(recommendations: DeploymentRecommendations): void {
  const { recommendations: items, score, summary, strengths } = recommendations;

  printSection(`DEPLOYMENT ANALYSIS  •  score: ${score.toFixed(1)}/10`);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of items) counts[r.priority]++;

  const parts: string[] = [];
  if (counts.critical > 0) parts.push(chalk.bgRed.white(` ${counts.critical} CRITICAL `));
  if (counts.high > 0) parts.push(chalk.red(`${counts.high} high`));
  if (counts.medium > 0) parts.push(chalk.yellow(`${counts.medium} medium`));
  if (counts.low > 0) parts.push(chalk.blue(`${counts.low} low`));
  if (parts.length === 0) parts.push(chalk.green('No issues found'));

  console.log('  ' + parts.join('  '));
  console.log();

  for (const [i, r] of items.entries()) {
    const priorityBadge =
      r.priority === 'critical' ? chalk.bgRed.white(' CRITICAL ')
      : r.priority === 'high'   ? chalk.red.bold(' HIGH     ')
      : r.priority === 'medium' ? chalk.yellow(' MEDIUM   ')
      :                           chalk.blue(' LOW      ');

    const effortBadge = r.effort === 'low' ? chalk.green('Low effort')
      : r.effort === 'medium' ? chalk.yellow('Medium effort')
      : chalk.red('High effort');

    console.log(`  ${chalk.bold.white(`${i + 1}.`)}  ${priorityBadge}  ${chalk.bold(r.title)}`);
    console.log(`     ${chalk.dim('Category:')}  ${r.category}  ${chalk.dim('|')}  ${chalk.dim(effortBadge)}`);
    console.log();
    console.log(`     ${chalk.yellow('◆ Issue')}`);
    console.log(`     ${chalk.dim('│')}  ${wrapText(r.description, 58, 10)}`);
    console.log();
    console.log(`     ${chalk.green('◆ Implementation')}`);
    console.log(`     ${chalk.dim('│')}  ${wrapText(r.implementation, 58, 10)}`);
    console.log();
    if (r.impact) {
      console.log(`     ${chalk.cyan('◆ Impact')}`);
      console.log(`     ${chalk.dim('│')}  ${chalk.dim(wrapText(r.impact, 58, 10))}`);
      console.log();
    }
    console.log(chalk.dim('  ╌'.repeat(30)));
    console.log();
  }

  if (strengths.length > 0) {
    printSection('DEPLOYMENT STRENGTHS');
    for (const s of strengths) {
      console.log(`  ${chalk.green('✓')} ${s}`);
    }
    console.log();
  }

  if (summary) {
    printSection('DEPLOYMENT SUMMARY');
    console.log(`  ${chalk.italic(wrapText(summary, 70, 2))}`);
    console.log();
  }
}

export function printCodebaseReport(report: StackerReport): void {
  // Header
  console.log(chalk.dim(`  Comprehensive Codebase Report  •  ${report.analyzedAt}`));
  console.log(chalk.dim(`  Repository: ${report.repoName}`));
  console.log();

  // Stack section (reuse existing terminal report logic)
  printTerminalReport(report);

  // Security section
  if (report.securityFindings) {
    console.log();
    printSecurityReport(report.securityFindings);
  }

  // Deployment section
  if (report.deploymentRecommendations) {
    console.log();
    printDeploymentReport(report.deploymentRecommendations);
  }
}

export function printWelcomeUI(): void {
  printBanner();

  console.log(chalk.bold.white('  AI-powered codebase analysis for modern developers'));
  console.log();

  console.log(chalk.bold.blue('  COMMANDS'));
  console.log();
  console.log(`  ${chalk.cyan('stacker analyze')} ${chalk.dim('<repo>')}        ${chalk.white('Analyze technology stack')}`);
  console.log(`  ${chalk.cyan('stacker security')} ${chalk.dim('<repo>')}       ${chalk.white('Scan for security vulnerabilities')}`);
  console.log(`  ${chalk.cyan('stacker deployment')} ${chalk.dim('<repo>')}     ${chalk.white('Get deployment recommendations')}`);
  console.log(`  ${chalk.cyan('stacker codebase')} ${chalk.dim('<repo>')}       ${chalk.white('Full comprehensive analysis')}`);
  console.log();

  console.log(chalk.bold.blue('  EXAMPLES'));
  console.log();
  console.log(`  ${chalk.dim('stacker analyze github.com/user/repo')}`);
  console.log(`  ${chalk.dim('stacker security ./my-project')}`);
  console.log(`  ${chalk.dim('stacker codebase https://github.com/user/repo --format markdown')}`);
  console.log();

  console.log(chalk.bold.blue('  OPTIONS'));
  console.log();
  console.log(`  ${chalk.cyan('--format')} ${chalk.dim('terminal|json|markdown')}   ${chalk.white('Output format')} ${chalk.dim('(default: terminal)')}`);
  console.log(`  ${chalk.cyan('--output')} ${chalk.dim('<file>')}                   ${chalk.white('Save report to file')}`);
  console.log(`  ${chalk.cyan('--skip-ai')}                         ${chalk.white('Rule-based analysis only')}`);
  console.log(`  ${chalk.cyan('--verbose')}                         ${chalk.white('Show debug output')}`);
  console.log();

  console.log(chalk.dim('  Run stacker <command> --help for more information.'));
  console.log();
}
