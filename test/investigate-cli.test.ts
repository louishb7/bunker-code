import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnalysisResult } from '@bunker-code/contracts';
import type {
  ImpactReport,
  PackageDependency,
  ProjectDiagnosticsReport,
  ProjectGraph,
  ProjectStructure,
} from '@bunker-code/graph-engine';
import { run } from '../apps/cli/src/main.js';

interface CliOutput {
  analysis: AnalysisResult;
  graph: ProjectGraph;
  diagnostics: ProjectDiagnosticsReport;
  structure: ProjectStructure;
  packageDependencies: PackageDependency[];
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
  const first = runCli(['analyze', 'fixtures/simple-import']);
  const second = runCli(['analyze', 'fixtures/simple-import']);

  assert.equal(first.status, 0);
  assert.equal(first.stderr, '');
  assert.equal(second.status, 0);
  assert.equal(second.stderr, '');
  assert.equal(first.stdout, second.stdout);

  const output = JSON.parse(first.stdout) as CliOutput;

  assert.equal(output.analysis.schemaVersion, 1);
  assert.deepEqual(output.analysis.analyzer, {
    name: '@bunker-code/analyzer-typescript',
    language: 'typescript',
  });
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
  assert.deepEqual(output.structure, {
    packages: [],
    fileMemberships: [],
    unassignedFileIds: ['src/main.ts', 'src/service.ts'],
  });
  assert.deepEqual(output.packageDependencies, []);
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

test('includes structural facts in the enriched analyze result for a PNPM workspace', () => {
  const result = runCli(['analyze', 'fixtures/pnpm-workspace-structure']);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');

  const output = JSON.parse(result.stdout) as CliOutput;

  assert.equal(output.analysis.tsconfigPath, undefined);
  assert.equal(output.analysis.workspaceConfigurationPath, 'pnpm-workspace.yaml');
  assert.equal(output.structure.packages.length, 4);
  assert.deepEqual(output.packageDependencies.map((dependency) => ({
    sourcePackageId: dependency.sourcePackageId,
    targetPackageId: dependency.targetPackageId,
    fileDependencyCount: dependency.fileDependencies.length,
  })), [{
    sourcePackageId: 'workspace-package:apps/application',
    targetPackageId: 'workspace-package:packages/library',
    fileDependencyCount: 2,
  }]);
});

test('prints deterministic impact JSON for a controlled project', () => {
  const first = runCli(['impact', 'fixtures/simple-import', 'src/service.ts']);
  const second = runCli(['impact', 'fixtures/simple-import', '.\\src\\service.ts']);

  assert.equal(first.status, 0);
  assert.equal(first.stderr, '');
  assert.equal(second.status, 0);
  assert.equal(second.stderr, '');
  assert.equal(first.stdout, second.stdout);

  const output = JSON.parse(first.stdout) as ImpactReport;

  assert.deepEqual(output.target, {
    id: 'src/service.ts',
    kind: 'file',
    path: 'src/service.ts',
  });
  assert.deepEqual(output.directDependents, [
    { id: 'src/main.ts', kind: 'file', path: 'src/main.ts' },
  ]);
  assert.deepEqual(output.affectedDependents, [
    {
      node: { id: 'src/main.ts', kind: 'file', path: 'src/main.ts' },
      depth: 1,
      path: ['src/service.ts', 'src/main.ts'],
    },
  ]);
  assert.equal(output.totalAffected, 1);
  assert.equal(output.maxDepth, 1);
  assert.equal(output.circularity.participatesInCycle, false);
});

test('keeps argument and target errors on stderr with a non-zero exit code', () => {
  const missingCommand = runCli([]);
  const analyzeExtraArgument = runCli(['analyze', 'fixtures/simple-import', '--unexpected']);
  const impactMissingTarget = runCli(['impact', 'fixtures/simple-import']);
  const impactMissingNode = runCli(['impact', 'fixtures/simple-import', 'src/missing.ts']);

  assert.equal(missingCommand.status, 1);
  assert.equal(missingCommand.stdout, '');
  assert.equal(
    missingCommand.stderr,
    'Usage:\n  pnpm analyze <project-path>\n  pnpm impact <project-path> <project-relative-file-path>\n',
  );
  assert.equal(analyzeExtraArgument.status, 1);
  assert.equal(analyzeExtraArgument.stdout, '');
  assert.equal(analyzeExtraArgument.stderr, 'Usage: pnpm analyze <project-path>\n');
  assert.equal(impactMissingTarget.status, 1);
  assert.equal(impactMissingTarget.stdout, '');
  assert.equal(impactMissingTarget.stderr, 'Usage: pnpm impact <project-path> <project-relative-file-path>\n');
  assert.equal(impactMissingNode.status, 1);
  assert.equal(impactMissingNode.stdout, '');
  assert.equal(
    impactMissingNode.stderr,
    'Impact target file not found in project graph: src/missing.ts\n',
  );
});

test('keeps legacy single-argument analyze invocation working inside the CLI module', () => {
  const result = runCli(['fixtures/simple-import']);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout) as CliOutput;
  assert.equal(output.analysis.schemaVersion, 1);
});
