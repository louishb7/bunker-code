import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'out',
]);

export type AnalysisTargetEvidence =
  | { kind: 'tsconfig'; path: string }
  | { kind: 'pnpm-workspace'; path: string };

export interface DiscoveredAnalysisTarget {
  rootPath: string;
  relativePath: string;
  language: 'typescript';
  kind: 'typescript-project' | 'pnpm-workspace';
  evidence: AnalysisTargetEvidence[];
}

export function discoverAnalysisTargets(inputPath: string): DiscoveredAnalysisTarget[] {
  const repositoryRoot = path.resolve(inputPath);

  if (!existsSync(repositoryRoot) || !statSync(repositoryRoot).isDirectory()) {
    throw new Error(`Project directory not found: ${repositoryRoot}`);
  }

  const directTarget = readDirectTarget(repositoryRoot, repositoryRoot);
  if (directTarget) return [directTarget];

  const candidates = new Map<string, DiscoveredAnalysisTarget>();
  const pendingDirectories = [repositoryRoot];

  while (pendingDirectories.length > 0) {
    const currentPath = pendingDirectories.pop();
    if (!currentPath) continue;

    const entries = readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (!entry.isDirectory() || EXCLUDED_DIRECTORIES.has(entry.name)) continue;

      const entryPath = path.join(currentPath, entry.name);
      const target = readDirectTarget(repositoryRoot, entryPath);

      if (target) {
        candidates.set(target.rootPath, target);
      } else {
        pendingDirectories.push(entryPath);
      }
    }
  }

  return [...candidates.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

export function resolveAnalysisTarget(inputPath: string): string {
  const repositoryRoot = path.resolve(inputPath);
  const candidates = discoverAnalysisTargets(repositoryRoot);

  if (candidates.length === 0) {
    throw new Error(`No supported TypeScript analysis target was found under ${repositoryRoot}.`);
  }

  if (candidates.length > 1) {
    throw new Error([
      `Multiple supported TypeScript analysis targets were found under ${repositoryRoot}:`,
      ...candidates.map((candidate) => `- ${candidate.relativePath}`),
      'Provide one target directory explicitly.',
    ].join('\n'));
  }

  const [candidate] = candidates;
  if (!candidate) throw new Error(`No supported TypeScript analysis target was found under ${repositoryRoot}.`);
  return candidate.rootPath;
}

function readDirectTarget(
  repositoryRoot: string,
  candidateRoot: string,
): DiscoveredAnalysisTarget | undefined {
  const relativePath = normalizeRelativePath(repositoryRoot, candidateRoot) || '.';
  const tsconfigPath = path.join(candidateRoot, 'tsconfig.json');

  if (isFile(tsconfigPath)) {
    return {
      rootPath: candidateRoot,
      relativePath,
      language: 'typescript',
      kind: 'typescript-project',
      evidence: [{ kind: 'tsconfig', path: normalizeRelativePath(repositoryRoot, tsconfigPath) }],
    };
  }

  const workspacePath = path.join(candidateRoot, 'pnpm-workspace.yaml');
  if (isFile(workspacePath)) {
    return {
      rootPath: candidateRoot,
      relativePath,
      language: 'typescript',
      kind: 'pnpm-workspace',
      evidence: [{ kind: 'pnpm-workspace', path: normalizeRelativePath(repositoryRoot, workspacePath) }],
    };
  }

  return undefined;
}

function isFile(filePath: string): boolean {
  return existsSync(filePath) && lstatSync(filePath).isFile();
}

function normalizeRelativePath(rootPath: string, targetPath: string): string {
  return path.relative(rootPath, targetPath).replaceAll('\\', '/');
}
