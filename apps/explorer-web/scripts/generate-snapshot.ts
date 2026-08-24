import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeProject } from '@bunker-code/analyzer-typescript';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(currentDirectory, '..');
const datasetDirectory = path.resolve(appDirectory, '..', '..');
const outputDirectory = path.join(appDirectory, 'src', 'generated');
const outputPath = path.join(outputDirectory, 'analyzer-typescript.snapshot.json');

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(analyzeProject(datasetDirectory), null, 2)}\n`);
