import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateExplorerSnapshot } from './explorer-development-target.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(currentDirectory, '..');
const defaultTarget = path.resolve(appDirectory, '..', '..');
const outputDirectory = path.join(appDirectory, 'src', 'generated');
const outputPath = path.join(outputDirectory, 'analyzer-typescript.snapshot.json');

generateExplorerSnapshot({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  defaultTarget,
  outputPath,
});
