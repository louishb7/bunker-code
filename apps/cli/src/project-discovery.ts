import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

/** Resolves a repository input to the concrete target consumed by the analyzer. */
export function resolveAnalysisTarget(inputPath: string): string {
  const rootPath = path.resolve(inputPath);

  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`Project directory not found: ${rootPath}`);
  }

  const directTsconfigPath = path.join(rootPath, 'tsconfig.json');

  if (existsSync(directTsconfigPath)) return rootPath;
  if (existsSync(path.join(rootPath, 'pnpm-workspace.yaml'))) return rootPath;

  const candidates = findTsconfigFiles(rootPath).sort((left, right) => left.localeCompare(right));
  if (candidates.length === 0) {
    throw new Error(`No analyzable tsconfig.json found below project target: ${rootPath}`);
  }
  if (candidates.length > 1) {
    throw new Error([
      `Multiple tsconfig.json candidates found below ${rootPath}:`,
      ...candidates.map((candidate) => `  ${path.dirname(candidate)}`),
      'Provide the target directory explicitly.',
    ].join('\n'));
  }
  const [candidate] = candidates;

  if (!candidate) {
    throw new Error(`No analyzable tsconfig.json found below project target: ${rootPath}`);
  }

  return path.dirname(candidate);
}

function findTsconfigFiles(rootPath: string): string[] {
  const candidates: string[] = [];
  const pendingDirectories = [rootPath];
  while (pendingDirectories.length > 0) {
    const currentPath = pendingDirectories.pop();
    if (!currentPath) continue;
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) pendingDirectories.push(entryPath);
      } else if (entry.isFile() && entry.name === 'tsconfig.json') {
        candidates.push(entryPath);
      }
    }
  }
  return candidates;
}
