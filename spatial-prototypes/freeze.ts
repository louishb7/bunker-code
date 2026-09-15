import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { snapshots } from './snapshots.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = process.argv[2] ?? '/tmp';
mkdirSync(path.join(root, '.snapshots'), { recursive: true });
for (const snapshot of snapshots) {
  const target = path.join(root, '.snapshots', `${snapshot.id}.json`);
  const source = existsSync(target) ? target : path.join(sourceRoot, `bunkercode-cartography-${snapshot.id}`, 'snapshot.json');
  const bytes = readFileSync(source);
  if (createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256) {
    throw new Error(`Snapshot hash mismatch: ${snapshot.id}. No replacement was made.`);
  }
  if (!existsSync(target)) copyFileSync(source, target);
  console.log(`${snapshot.id} ${snapshot.sha256} ${bytes.length} bytes`);
}

