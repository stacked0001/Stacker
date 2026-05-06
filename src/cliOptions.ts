export function getCommandOption<T>(cmdOptions: unknown, name: string): T | undefined {
  if (cmdOptions && typeof (cmdOptions as { opts?: unknown }).opts === 'function') {
    return ((cmdOptions as { opts: () => Record<string, T | undefined> }).opts())[name];
  }
  if (cmdOptions && typeof cmdOptions === 'object') {
    return (cmdOptions as Record<string, T | undefined>)[name];
  }
  return undefined;
}

export function getArgValue(argv: string[], flag: string): string | undefined {
  const withEquals = `${flag}=`;
  const equalsMatch = argv.find(arg => arg.startsWith(withEquals));
  if (equalsMatch) return equalsMatch.slice(withEquals.length);

  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) {
    return argv[index + 1];
  }

  return undefined;
}

export function hasArgFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag) || argv.some(arg => arg.startsWith(`${flag}=`));
}
