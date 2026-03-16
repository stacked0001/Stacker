import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  private level: LogLevel = 'info';
  private verbose = false;

  configure(options: { verbose?: boolean; level?: LogLevel }): void {
    if (options.verbose) {
      this.verbose = true;
      this.level = 'debug';
    }
    if (options.level) {
      this.level = options.level;
    }
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(chalk.dim(`[DEBUG] ${msg}`), ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(chalk.cyan(`  ℹ ${msg}`), ...args);
    }
  }

  success(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(chalk.green(`  ✓ ${msg}`), ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(chalk.yellow(`  ⚠ ${msg}`), ...args);
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(chalk.red(`  ✗ ${msg}`), ...args);
    }
  }

  step(step: number, total: number, msg: string): void {
    if (this.shouldLog('info')) {
      console.log(chalk.dim(`  [${step}/${total}]`) + ` ${msg}`);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }
}

export const logger = new Logger();
