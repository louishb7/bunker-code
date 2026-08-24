import { mkdirSync, writeFileSync } from 'node:fs';
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
};

writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
