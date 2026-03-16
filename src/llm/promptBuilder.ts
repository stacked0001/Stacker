import { DetectedStack } from '../stackDetector';

export interface ProjectSummaryInput {
  stack: DetectedStack;
  fileCount: number;
  componentCount: number;
  apiRouteCount: number;
  repoPath: string;
}

export function buildProjectSummary(input: ProjectSummaryInput): string {
  const { stack, fileCount, componentCount, apiRouteCount } = input;

  const lines: string[] = [
    `PROJECT TYPE: ${stack.projectType}`,
    '',
    'FRONTEND',
    stack.frontend.length > 0 ? stack.frontend.join(', ') : 'None detected',
    '',
    'BACKEND',
    stack.backend.length > 0 ? stack.backend.join(', ') : 'None detected',
    '',
    'DATABASE',
    stack.databases.length > 0 ? stack.databases.join(', ') : 'None detected',
    '',
    'STYLING',
    stack.styling.length > 0 ? stack.styling.join(', ') : 'None detected',
    '',
    'LANGUAGE',
    stack.language,
    '',
    'PACKAGE MANAGER',
    stack.packageManager || 'Unknown',
    '',
    'API ROUTES',
    String(apiRouteCount),
    '',
    'COMPONENT COUNT',
    String(componentCount),
    '',
    'FILE COUNT',
    String(fileCount),
    '',
    'DEPENDENCIES',
    stack.dependencies.slice(0, 30).join(' '),
    '',
    'DEV DEPENDENCIES',
    stack.devDependencies.slice(0, 20).join(' ')
  ];

  return lines.join('\n');
}
