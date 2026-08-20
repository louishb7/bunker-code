import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { parse } from 'yaml';
import type { WorkspacePackage, WorkspacePackageEvidence } from './analysis-result.js';

interface PackageManifest {
  name?: unknown;
}

interface PnpmWorkspaceConfiguration {
  packages?: unknown;
}

export interface DetectedPnpmWorkspace {
  rootPath: string;
  configurationPath: string;
  packages: WorkspacePackage[];
}

function normalizeRelativePath(rootPath: string, targetPath: string): string {
  return path.relative(rootPath, targetPath).replaceAll('\\', '/');
}

function packageId(rootPath: string): string {
  return `workspace-package:${rootPath}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readWorkspacePatterns(configurationPath: string): string[] {
  let parsed: unknown;

  try {
    parsed = parse(readFileSync(configurationPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid PNPM workspace configuration: ${message}`);
  }

  const configuration: PnpmWorkspaceConfiguration = isRecord(parsed) ? parsed : {};

  if (configuration.packages === undefined) {
    return [];
  }

  if (!Array.isArray(configuration.packages) || !configuration.packages.every((pattern) => typeof pattern === 'string')) {
    throw new Error(`Invalid PNPM workspace configuration: "packages" must be an array of strings in ${configurationPath}`);
  }

  return [...configuration.packages].sort();
}

function findWorkspaceConfiguration(inputPath: string): string | undefined {
  let currentPath = path.resolve(inputPath);

  while (true) {
    const configurationPath = path.join(currentPath, 'pnpm-workspace.yaml');

    if (existsSync(configurationPath)) {
      return configurationPath;
    }

    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      return undefined;
    }

    currentPath = parentPath;
  }
}

function readPackageName(manifestPath: string): string | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid workspace package manifest: ${manifestPath}: ${message}`);
  }

  const manifest: PackageManifest = isRecord(parsed) ? parsed : {};

  return typeof manifest.name === 'string' && manifest.name.length > 0 ? manifest.name : undefined;
}

/** Detects PNPM workspace packages only from declared membership and package manifests. */
export function detectPnpmWorkspace(inputPath: string): DetectedPnpmWorkspace | undefined {
  const configurationPath = findWorkspaceConfiguration(inputPath);

  if (!configurationPath) {
    return undefined;
  }

  const rootPath = path.dirname(configurationPath);
  const patterns = readWorkspacePatterns(configurationPath);
  const includePatterns = patterns.filter((pattern) => !pattern.startsWith('!'));
  const excludePatterns = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));

  if (includePatterns.length === 0) {
    return { rootPath, configurationPath, packages: [] };
  }

  const matchedDirectories = new Set(fg.sync(includePatterns, {
    cwd: rootPath,
    onlyDirectories: true,
    ignore: excludePatterns,
    unique: true,
    absolute: false,
  }).map((directoryPath) => directoryPath.replaceAll('\\', '/')));

  const packageRoots = new Map<string, string>();

  for (const pattern of includePatterns) {
    for (const directoryPath of fg.sync(pattern, {
      cwd: rootPath,
      onlyDirectories: true,
      ignore: excludePatterns,
      unique: true,
      absolute: false,
    })) {
      const normalizedPath = directoryPath.replaceAll('\\', '/');

      if (!matchedDirectories.has(normalizedPath) || packageRoots.has(normalizedPath)) {
        continue;
      }

      packageRoots.set(normalizedPath, pattern);
    }
  }

  const packages: WorkspacePackage[] = [];

  for (const [rootRelativePath, pattern] of [...packageRoots.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const absolutePackagePath = path.join(rootPath, rootRelativePath);
    const manifestPath = path.join(absolutePackagePath, 'package.json');

    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
      continue;
    }

    const evidence: WorkspacePackageEvidence[] = [
      { kind: 'workspace-configuration', path: normalizeRelativePath(rootPath, configurationPath) },
      { kind: 'workspace-pattern', pattern },
      { kind: 'package-manifest', path: normalizeRelativePath(rootPath, manifestPath) },
    ];
    const name = readPackageName(manifestPath);

    packages.push({
      id: packageId(rootRelativePath),
      kind: 'workspace-package',
      origin: 'detected',
      rootPath: rootRelativePath,
      ...(name ? { name } : {}),
      evidence,
    });
  }

  return { rootPath, configurationPath, packages };
}
