import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnalysisResult } from '@bunker-code/contracts';
import type { ProjectDiagnosticsReport, ProjectGraph } from '@bunker-code/graph-engine';
import { run } from '../apps/cli/src/main.js';

interface CliOutput {
  analysis: AnalysisResult;
  graph: ProjectGraph;
  diagnostics: ProjectDiagnosticsReport;
}

function runCli(args: string[]) {
  let stdout = '';
  let stderr = '';
  const status = run(args, {
    writeStdout: (output) => {
      stdout += output;
    },
    writeStderr: (output) => {
      stderr += output;
    },
  });

  return { status, stdout, stderr };
}

test('prints deterministic investigation JSON for a controlled project', () => {
  const first = runCli(['fixtures/simple-import']);
  const second = runCli(['fixtures/simple-import']);

  assert.equal(first.status, 0);
  assert.equal(first.stderr, '');
  assert.equal(second.status, 0);
  assert.equal(second.stderr, '');
  assert.equal(first.stdout, second.stdout);

  const output = JSON.parse(first.stdout) as CliOutput;

  assert.deepEqual(output.analysis.files.map((file) => file.path), [
    'src/main.ts',
    'src/service.ts',
  ]);
  assert.deepEqual(output.graph.edges.map((edge) => ({
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    moduleSpecifier: edge.moduleSpecifier,
    confidence: edge.confidence,
  })), [
    {
      sourceNodeId: 'src/main.ts',
      targetNodeId: 'src/service.ts',
      moduleSpecifier: './service',
      confidence: 'exact',
    },
  ]);
  assert.deepEqual(output.diagnostics.thresholds, {
    manyDependents: 2,
    manyDependencies: 3,
  });
  assert.deepEqual(
    output.diagnostics.diagnostics.map(({ id, kind, basis, confidence }) => ({
      id,
      kind,
      basis,
      confidence,
    })),
    [
      { id: 'fan-in:src/main.ts', kind: 'fan-in', basis: 'fact', confidence: 'exact' },
      { id: 'fan-in:src/service.ts', kind: 'fan-in', basis: 'fact', confidence: 'exact' },
      { id: 'fan-out:src/main.ts', kind: 'fan-out', basis: 'fact', confidence: 'exact' },
      { id: 'fan-out:src/service.ts', kind: 'fan-out', basis: 'fact', confidence: 'exact' },
    ],
  );
});

test('keeps argument errors on stderr with a non-zero exit code', () => {
  const missingProjectPath = runCli([]);
  const extraArgument = runCli(['fixtures/simple-import', '--unexpected']);

  assert.equal(missingProjectPath.status, 1);
  assert.equal(missingProjectPath.stdout, '');
  assert.equal(missingProjectPath.stderr, 'Usage: pnpm analyze <project-path>\n');
  assert.equal(extraArgument.status, 1);
  assert.equal(extraArgument.stdout, '');
  assert.equal(extraArgument.stderr, 'Usage: pnpm analyze <project-path>\n');
});
