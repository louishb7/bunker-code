import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveAnalysisTarget } from '../apps/cli/src/project-discovery.js';

function createTempRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'bunkercode-discovery-'));
}

function write(root: string, relativePath: string): void {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, '{}');
}

test('preserves a target that already has a root tsconfig', () => {
  const root = createTempRoot();
  try {
    write(root, 'tsconfig.json');
    write(root, 'nested/tsconfig.json');

    assert.equal(resolveAnalysisTarget(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discovers the only nested tsconfig target', () => {
  const root = createTempRoot();
  try {
    write(root, 'backend/tsconfig.json');

    assert.equal(resolveAnalysisTarget(root), path.join(root, 'backend'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects multiple nested tsconfig candidates deterministically', () => {
  const root = createTempRoot();
  try {
    write(root, 'zeta/tsconfig.json');
    write(root, 'alpha/tsconfig.json');

    assert.throws(
      () => resolveAnalysisTarget(root),
      new RegExp(`Multiple tsconfig.json candidates found below ${root}:\\n  ${root.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}/alpha\\n  ${root.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}/zeta`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports a clear error when no tsconfig candidate exists', () => {
  const root = createTempRoot();
  try {
    assert.throws(
      () => resolveAnalysisTarget(root),
      new Error(`No analyzable tsconfig.json found below project target: ${root}`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores tsconfig files in excluded directories and variant names', () => {
  const root = createTempRoot();
  try {
    write(root, 'node_modules/ignored/tsconfig.json');
    write(root, 'dist/ignored/tsconfig.json');
    write(root, 'build/ignored/tsconfig.json');
    write(root, 'coverage/ignored/tsconfig.json');
    write(root, 'backend/tsconfig.build.json');

    assert.throws(
      () => resolveAnalysisTarget(root),
      new Error(`No analyzable tsconfig.json found below project target: ${root}`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps declared PNPM workspace roots on the existing analysis path', () => {
  const root = createTempRoot();
  try {
    write(root, 'pnpm-workspace.yaml');

    assert.equal(resolveAnalysisTarget(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
