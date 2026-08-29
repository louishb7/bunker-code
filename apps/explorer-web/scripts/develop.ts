import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateExplorerSnapshot } from './explorer-development-target.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(currentDirectory, '..');
const defaultTarget = path.resolve(appDirectory, '..', '..');
const outputPath = path.join(appDirectory, 'src', 'generated', 'analyzer-typescript.snapshot.json');

try {
  generateExplorerSnapshot({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    defaultTarget,
    outputPath,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  const viteExecutable = path.join(
    appDirectory,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  );
  const vite = spawn(viteExecutable, [], { cwd: appDirectory, stdio: 'inherit' });
  vite.on('error', (error) => { throw error; });
  vite.on('exit', (code) => { process.exitCode = code ?? 1; });
}
