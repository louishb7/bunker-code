import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  discoverAnalysisTargets,
  resolveAnalysisTarget,
} from '../packages/analyzer-typescript/src/index.js';

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

    assert.deepEqual(discoverAnalysisTargets(root), [{
      rootPath: root,
      relativePath: '.',
      language: 'typescript',
      kind: 'typescript-project',
      evidence: [{ kind: 'tsconfig', path: 'tsconfig.json' }],
    }]);
    assert.equal(resolveAnalysisTarget(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discovers the only nested tsconfig target', () => {
  const root = createTempRoot();
  try {
    write(root, 'project/tsconfig.json');

    assert.deepEqual(discoverAnalysisTargets(root), [{
      rootPath: path.join(root, 'project'),
      relativePath: 'project',
      language: 'typescript',
      kind: 'typescript-project',
      evidence: [{ kind: 'tsconfig', path: 'project/tsconfig.json' }],
    }]);
    assert.equal(resolveAnalysisTarget(root), path.join(root, 'project'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects multiple nested tsconfig candidates deterministically', () => {
  const root = createTempRoot();
  try {
    write(root, 'zeta/tsconfig.json');
    write(root, 'alpha/tsconfig.json');

    assert.deepEqual(
      discoverAnalysisTargets(root).map((candidate) => candidate.relativePath),
      ['alpha', 'zeta'],
    );
    assert.throws(() => resolveAnalysisTarget(root), new Error([
      `Multiple supported TypeScript analysis targets were found under ${root}:`,
      '- alpha',
      '- zeta',
      'Provide one target directory explicitly.',
    ].join('\n')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports a clear error when no tsconfig candidate exists', () => {
  const root = createTempRoot();
  try {
    assert.deepEqual(discoverAnalysisTargets(root), []);
    assert.throws(() => resolveAnalysisTarget(root), new Error(
      `No supported TypeScript analysis target was found under ${root}.`,
    ));
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
    write(root, 'out/ignored/tsconfig.json');
    write(root, '.next/ignored/tsconfig.json');
    write(root, 'generated/ignored/tsconfig.json');
    write(root, '.git/ignored/tsconfig.json');
    write(root, 'project/tsconfig.build.json');

    assert.deepEqual(discoverAnalysisTargets(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keeps declared PNPM workspace roots on the existing analysis path', () => {
  const root = createTempRoot();
  try {
    write(root, 'pnpm-workspace.yaml');

    write(root, 'packages/member/tsconfig.json');

    assert.deepEqual(discoverAnalysisTargets(root), [{
      rootPath: root,
      relativePath: '.',
      language: 'typescript',
      kind: 'pnpm-workspace',
      evidence: [{ kind: 'pnpm-workspace', path: 'pnpm-workspace.yaml' }],
    }]);
    assert.equal(resolveAnalysisTarget(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stops descending after a nested supported target is found', () => {
  const root = createTempRoot();
  try {
    write(root, 'project/tsconfig.json');
    write(root, 'project/examples/tsconfig.json');
    write(root, 'other/tsconfig.json');

    assert.deepEqual(
      discoverAnalysisTargets(root).map((candidate) => candidate.relativePath),
      ['other', 'project'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not traverse symbolic links outside the repository root', () => {
  const root = createTempRoot();
  const outside = createTempRoot();
  try {
    write(outside, 'external/tsconfig.json');
    symlinkSync(outside, path.join(root, 'linked-outside'), 'dir');

    assert.deepEqual(discoverAnalysisTargets(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('an explicit nested target remains direct even when siblings exist', () => {
  const root = createTempRoot();
  try {
    write(root, 'api/tsconfig.json');
    write(root, 'frontend/tsconfig.json');

    assert.equal(resolveAnalysisTarget(path.join(root, 'api')), path.join(root, 'api'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
