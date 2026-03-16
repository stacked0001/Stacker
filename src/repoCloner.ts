import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit from 'simple-git';

export interface CloneResult {
  repoPath: string;
  isTemporary: boolean;
  repoName: string;
  cleanupFn: () => void;
}

export async function resolveRepository(
  target: string,
  onProgress?: (msg: string) => void
): Promise<CloneResult> {
  // Local path
  if (!isUrl(target)) {
    const absPath = path.resolve(target);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Path does not exist: ${absPath}`);
    }
    const stat = fs.statSync(absPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${absPath}`);
    }
    return {
      repoPath: absPath,
      isTemporary: false,
      repoName: path.basename(absPath),
      cleanupFn: () => {}
    };
  }

  // Remote URL — clone to temp dir
  const repoName = extractRepoName(target);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacker-'));

  onProgress?.(`Cloning ${repoName}...`);

  try {
    const git = simpleGit();
    await git.clone(target, tmpDir, ['--depth', '1', '--single-branch']);

    onProgress?.('Clone complete.');

    return {
      repoPath: tmpDir,
      isTemporary: true,
      repoName,
      cleanupFn: () => {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
    };
  } catch (err) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    throw new Error(`Failed to clone repository: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function isUrl(str: string): boolean {
  return (
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('git@') ||
    str.startsWith('git://')
  );
}

function extractRepoName(url: string): string {
  const parts = url.replace(/\.git$/, '').split('/');
  return parts[parts.length - 1] || 'unknown-repo';
}
