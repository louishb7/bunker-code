import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analyzeTypeScriptTarget } from '@bunker-code/analyzer-typescript';
import type { AnalysisResult, ResponsibilityAnalysisResult } from '@bunker-code/contracts';

export interface ExplorerSnapshotTarget {
  projectDirectory: string;
}

export interface ExplorerSnapshotTargetOptions {
  cwd: string;
  defaultTarget: string;
}

export interface GeneratedExplorerSnapshot {
  analysis: AnalysisResult;
  responsibilities: ResponsibilityAnalysisResult;
  projectLabel: string;
}

export function resolveExplorerSnapshotTarget(
  args: string[],
  options: ExplorerSnapshotTargetOptions,
): ExplorerSnapshotTarget {
  const targetArgs = args[0] === '--' ? args.slice(1) : args;

  if (targetArgs.length > 1) {
    throw new Error('Explorer accepts at most one target directory.');
  }

  const projectDirectory = path.resolve(options.cwd, targetArgs[0] ?? options.defaultTarget);

  if (!existsSync(projectDirectory)) {
    throw new Error(`Explorer target does not exist: ${projectDirectory}`);
  }

  if (!statSync(projectDirectory).isDirectory()) {
    throw new Error(`Explorer target is not a directory: ${projectDirectory}`);
  }

  return { projectDirectory };
}

export function generateExplorerSnapshot({
  args,
  cwd,
  defaultTarget,
  outputPath,
}: ExplorerSnapshotTargetOptions & { args: string[]; outputPath: string }): GeneratedExplorerSnapshot {
  const target = resolveExplorerSnapshotTarget(args, { cwd, defaultTarget });
  const { analysis, responsibilities } = analyzeTypeScriptTarget(target.projectDirectory);
  const snapshot: GeneratedExplorerSnapshot = {
    analysis,
    responsibilities,
    projectLabel: readProjectLabel(target.projectDirectory),
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

function readProjectLabel(projectDirectory: string): string {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path.join(projectDirectory, 'package.json'), 'utf8'));

    if (isRecord(manifest) && typeof manifest.name === 'string' && manifest.name.trim()) {
      return manifest.name.trim();
    }
  } catch {
    // An absent or invalid manifest does not prevent an explicit target from being analyzed.
  }

  return path.basename(projectDirectory) || 'Analyzed project';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
