import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeProject } from '@bunker-code/analyzer-typescript';
import { aggregatePackageDependencies, buildProjectGraph, buildProjectStructure } from '@bunker-code/graph-engine';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(currentDirectory, '..');
const datasetDirectory = path.resolve(appDirectory, '..', '..');
const outputDirectory = path.join(appDirectory, 'src', 'generated');
const outputPath = path.join(outputDirectory, 'analyzer-typescript.snapshot.json');

mkdirSync(outputDirectory, { recursive: true });
const analysis = analyzeProject(datasetDirectory);
const graph = buildProjectGraph(analysis);
const structure = buildProjectStructure(analysis);
const snapshot = {
  analysis,
  packageDependencies: aggregatePackageDependencies(graph, structure),
  projectLabel: readProjectLabel(datasetDirectory),
};

writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

function readProjectLabel(projectDirectory: string): string {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path.join(projectDirectory, 'package.json'), 'utf8'));

    if (isRecord(manifest) && typeof manifest.name === 'string' && manifest.name.trim()) {
      return manifest.name.trim();
    }
  } catch {
    // The local Explorer can still identify the target by its directory name.
  }

  return path.basename(projectDirectory) || 'Analyzed project';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
