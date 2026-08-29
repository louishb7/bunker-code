import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject, analyzeTypeScriptTarget } from '../packages/analyzer-typescript/src/index.js';
import {
  RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION,
  type Responsibility,
  type ResponsibilityAnalysisResult,
  type ResponsibilityCoverage,
  type ResponsibilityFinding,
} from '../packages/contracts/src/index.js';
import { buildProjectGraph, buildProjectStructure } from '../packages/graph-engine/src/index.js';
import { createExplorerAttention } from '../apps/explorer-web/src/explorer-attention.js';
import { createExplorerOrientation } from '../apps/explorer-web/src/explorer-orientation.js';
import { createExplorerProjection } from '../apps/explorer-web/src/explorer-projection.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import {
  chooseInitialExplorerPerspective,
  createExplorerResponsibilityProjection,
  resolveOwningTerritory,
  type ExplorerPerspective,
} from '../apps/explorer-web/src/explorer-responsibility-projection.js';
import { resolveExplorerSearchDestination } from '../apps/explorer-web/src/explorer-search.js';
import {
  createInitialExplorerLocation,
  focusExplorerFile,
  navigateToDestination,
  navigateToTerritory,
  selectExplorerItem,
} from '../apps/explorer-web/src/explorer-state.js';
import {
  createInitialExplorerViewState,
  locateResponsibilityFinding,
  selectExplorerResponsibility,
  switchExplorerPerspective,
} from '../apps/explorer-web/src/explorer-view-state.js';
import {
  createExplorerTerritoryProjection,
  orderedTerritoryChildren,
  parentExplorerTerritory,
} from '../apps/explorer-web/src/explorer-territory-projection.js';

function workspaceSource() {
  const analysis = analyzeProject(path.resolve('fixtures/pnpm-workspace-structure'));
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const territories = createExplorerTerritoryProjection(
    structure,
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  );

  return { graph, structure, territories };
}

function responsibilityFinding(
  responsibility: Responsibility,
  fileId: string,
  options: {
    id?: string;
    kind?: 'file' | 'class' | 'method' | 'function';
    confidence?: 'exact' | 'inferred';
    line?: number;
  } = {},
): ResponsibilityFinding {
  const kind = options.kind ?? 'method';
  const line = options.line ?? 1;
  const subject = kind === 'file'
    ? { id: `subject:${fileId}`, kind, fileId, location: { filePath: fileId, line, column: 1 } }
    : { id: `subject:${fileId}:${kind}:subject`, kind, fileId, symbolId: `${kind}:subject`, name: 'subject', location: { filePath: fileId, line, column: 1 } };

  return {
    id: options.id ?? `finding:${responsibility}:${fileId}:${line}`,
    subject,
    responsibility,
    confidence: options.confidence ?? 'exact',
    provenance: { detector: { id: 'test.detector', version: '1' }, ruleId: 'test-rule', ruleVersion: '1' },
    evidence: [{ id: `evidence:${responsibility}:${fileId}:${line}`, kind: 'declaration', technology: { id: 'test', displayName: 'Test' }, signal: 'test', location: { filePath: fileId, line, column: 1 } }],
  };
}

function responsibilityResult(
  findings: ResponsibilityFinding[],
  coverage: ResponsibilityCoverage[] = [],
): ResponsibilityAnalysisResult {
  return {
    schemaVersion: RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION,
    analyzer: { name: 'test', language: 'typescript' },
    projectPath: '.',
    findings,
    coverage,
    detectorExecutions: [],
    limitations: [],
  };
}

function perspectiveFor(result: ResponsibilityAnalysisResult): ExplorerPerspective {
  return chooseInitialExplorerPerspective(result);
}

test('runtime requires ResponsibilityAnalysisResult but keeps it outside territory projection', () => {
  const target = analyzeTypeScriptTarget(path.resolve('fixtures/simple-import'));
  const snapshot = { analysis: target.analysis, responsibilities: target.responsibilities, projectLabel: 'fixture' };
  const runtime = createExplorerRuntime(snapshot);

  assert.equal(runtime.kind, 'ready');
  if (runtime.kind !== 'ready') return;
  assert.deepEqual(runtime.responsibilities, target.responsibilities);

  const territories = createExplorerTerritoryProjection(
    runtime.structure,
    runtime.graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  );
  const projection = createExplorerProjection({ graph: runtime.graph, structure: runtime.structure, territories }, createInitialExplorerLocation(territories));
  assert.equal(projection.nodes.some((node) => node.kind === 'responsibility'), false);
});

test('responsibility projection keeps zero findings empty and chooses Territory', () => {
  const source = workspaceSource();
  const result = responsibilityResult([]);
  const projection = createExplorerResponsibilityProjection(result, source.territories);

  assert.deepEqual(projection.groups, []);
  assert.equal(projection.coverageSummary.hasFindings, false);
  assert.equal(projection.coverageSummary.findingCount, 0);
  assert.equal(perspectiveFor(result), 'territory');
});

test('only behavioral factual responsibility families qualify the initial perspective', () => {
  const cases: Array<{ finding: ResponsibilityFinding; expected: ExplorerPerspective }> = [
    { finding: responsibilityFinding('framework-wiring', 'apps/application/src/main.ts'), expected: 'territory' },
    { finding: responsibilityFinding('http-entry-point', 'apps/application/src/main.ts'), expected: 'responsibility' },
    { finding: responsibilityFinding('persistence-interaction', 'apps/application/src/main.ts'), expected: 'responsibility' },
    { finding: responsibilityFinding('access-control', 'apps/application/src/main.ts'), expected: 'responsibility' },
    { finding: responsibilityFinding('external-service-interaction', 'apps/application/src/main.ts'), expected: 'responsibility' },
    { finding: responsibilityFinding('queue-consumer', 'apps/application/src/main.ts'), expected: 'responsibility' },
  ];

  for (const { finding, expected } of cases) {
    assert.equal(perspectiveFor(responsibilityResult([finding])), expected);
  }
});

test('coverage incompleteness remains explicit without becoming an absence claim', () => {
  const partialFinding = responsibilityFinding('http-entry-point', 'apps/application/src/main.ts');
  const partial = responsibilityResult([partialFinding], [
    { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'partially-evaluated', limitationIds: ['limitation:http'] },
  ]);
  const partialProjection = createExplorerResponsibilityProjection(partial, workspaceSource().territories);

  assert.equal(perspectiveFor(partial), 'responsibility');
  assert.equal(partialProjection.coverageSummary.hasPartialCoverage, true);
  assert.equal(partialProjection.coverageSummary.hasFailures, false);
  assert.equal(partialProjection.coverageSummary.hasUnsupportedCapabilities, false);

  const incompleteWithoutQualifyingFinding = responsibilityResult([responsibilityFinding('framework-wiring', 'apps/application/src/main.ts')], [
    { capability: 'framework-wiring', scope: { kind: 'project' }, status: 'partially-evaluated', limitationIds: ['limitation:wiring'] },
    { capability: 'access-control', scope: { kind: 'project' }, status: 'failed', failure: { code: 'detector-failed', message: 'Failure.' }, limitationIds: [] },
    { capability: 'cache-interaction', scope: { kind: 'project' }, status: 'unsupported' },
  ]);
  const incompleteProjection = createExplorerResponsibilityProjection(incompleteWithoutQualifyingFinding, workspaceSource().territories);

  assert.equal(perspectiveFor(incompleteWithoutQualifyingFinding), 'territory');
  assert.equal(incompleteProjection.coverageSummary.hasPartialCoverage, true);
  assert.equal(incompleteProjection.coverageSummary.hasFailures, true);
  assert.equal(incompleteProjection.coverageSummary.hasUnsupportedCapabilities, true);
  assert.equal(incompleteProjection.coverageSummary.hasFindings, true);

  const notEvaluated = responsibilityResult([], [
    { capability: 'scheduled-job', scope: { kind: 'project' }, status: 'not-evaluated' },
  ]);
  const notEvaluatedProjection = createExplorerResponsibilityProjection(notEvaluated, workspaceSource().territories);
  assert.equal(notEvaluatedProjection.coverageSummary.hasNotEvaluatedCoverage, true);
  assert.equal(notEvaluatedProjection.coverageSummary.hasFindings, false);
  assert.equal(perspectiveFor(notEvaluated), 'territory');
});

test('responsibility composition preserves original subjects, findings, confidence, and multiple roles', () => {
  const source = workspaceSource();
  const http = responsibilityFinding('http-entry-point', 'apps/application/src/main.ts', { id: 'finding:http', kind: 'method', line: 4 });
  const access = responsibilityFinding('access-control', 'apps/application/src/main.ts', { id: 'finding:access', kind: 'method', confidence: 'inferred', line: 4 });
  const persistence = responsibilityFinding('persistence-interaction', 'packages/library/src/first.ts', { id: 'finding:persistence', kind: 'function', line: 8 });
  const persistenceClass = responsibilityFinding('persistence-interaction', 'packages/library/src/first.ts', { id: 'finding:persistence-class', kind: 'class', line: 9 });
  const result = responsibilityResult([persistenceClass, persistence, access, http]);
  const projection = createExplorerResponsibilityProjection(result, source.territories);

  assert.deepEqual(projection.groups.map((group) => group.family), ['interface', 'security', 'data']);
  assert.deepEqual(projection.groups.flatMap((group) => group.responsibilities.map((item) => item.responsibility)), ['http-entry-point', 'access-control', 'persistence-interaction']);
  assert.equal(projection.groups[0]?.responsibilities[0]?.findings[0], http);
  assert.equal(projection.groups[1]?.responsibilities[0]?.findings[0], access);
  assert.equal(projection.groups[1]?.responsibilities[0]?.findings[0]?.confidence, 'inferred');
  assert.equal(projection.groups[2]?.responsibilities[0]?.findings[0]?.subject.kind, 'function');
  assert.equal(projection.groups[2]?.responsibilities[0]?.findings[1]?.subject.kind, 'class');
  assert.deepEqual(Object.keys(projection.groups[2]?.responsibilities[0] ?? {}).sort(), ['findings', 'responsibility', 'subjectCount', 'territoryIds']);
  assert.equal(projection.groups.flatMap((group) => group.responsibilities).some((item) => 'primaryResponsibility' in item), false);
});

test('responsibility ownership uses factual file containment and rejects inferred or unknown paths', () => {
  const source = workspaceSource();

  assert.equal(resolveOwningTerritory('packages/library/src/first.ts', source.territories)?.id, 'directory:packages/library/src');
  assert.equal(resolveOwningTerritory('orphan.ts', source.territories)?.id, 'analysis-root:.');
  assert.throws(
    () => resolveOwningTerritory('missing.ts', source.territories),
    /Responsibility finding file is not present in Explorer territory containment: missing\.ts/,
  );
  assert.throws(
    () => resolveOwningTerritory('packages/library/src/not-in-projection.ts', source.territories),
    /Responsibility finding file is not present in Explorer territory containment: packages\/library\/src\/not-in-projection\.ts/,
  );
});

test('responsibility aggregation resolves deepest owning Territories and preserves independent findings', () => {
  const source = workspaceSource();
  const first = responsibilityFinding('persistence-interaction', 'packages/library/src/first.ts', { id: 'finding:second', line: 20 });
  const second = responsibilityFinding('persistence-interaction', 'packages/library/src/first.ts', { id: 'finding:first', kind: 'class', line: 3 });
  const third = responsibilityFinding('persistence-interaction', 'apps/application/src/main.ts', { id: 'finding:third', line: 2 });
  const projection = createExplorerResponsibilityProjection(responsibilityResult([first, third, second]), source.territories);
  const persistence = projection.groups[0]?.responsibilities[0];

  assert.deepEqual(persistence?.findings, [third, second, first]);
  assert.equal(persistence?.subjectCount, 3);
  assert.deepEqual(persistence?.territoryIds, ['directory:apps/application/src', 'directory:packages/library/src']);
});

test('responsibility composition is deterministic and leaves ExplorerLocation unchanged', () => {
  const source = workspaceSource();
  const findings = [
    responsibilityFinding('access-control', 'apps/application/src/main.ts', { id: 'finding:b', line: 8 }),
    responsibilityFinding('http-entry-point', 'apps/application/src/main.ts', { id: 'finding:a', line: 9 }),
  ];
  const location = createInitialExplorerLocation(source.territories);

  assert.deepEqual(
    createExplorerResponsibilityProjection(responsibilityResult(findings), source.territories),
    createExplorerResponsibilityProjection(responsibilityResult([...findings].reverse()), source.territories),
  );
  assert.deepEqual(location, createInitialExplorerLocation(source.territories));
  assert.equal('perspective' in location, false);
});

test('Explorer view state chooses its initial perspective through D3 eligibility', () => {
  const territories = workspaceSource().territories;
  const qualifying = responsibilityResult([
    responsibilityFinding('http-entry-point', 'apps/application/src/main.ts'),
  ]);
  const wiringOnly = responsibilityResult([
    responsibilityFinding('framework-wiring', 'apps/application/src/main.ts'),
  ]);

  assert.equal(createInitialExplorerViewState(qualifying, territories).perspective, 'responsibility');
  assert.equal(createInitialExplorerViewState(wiringOnly, territories).perspective, 'territory');
  assert.equal(createInitialExplorerViewState(responsibilityResult([]), territories).perspective, 'territory');
});

test('perspective and Responsibility selection preserve structural location until factual Locate', () => {
  const territories = workspaceSource().territories;
  const finding = responsibilityFinding('http-entry-point', 'packages/library/src/first.ts');
  const responsibilities = responsibilityResult([finding]);
  const initial = createInitialExplorerViewState(responsibilities, territories);
  const territory = territories.territoriesById.get('directory:apps/application/src');
  assert.ok(territory);
  if (!territory) return;
  const locatedElsewhere = {
    ...initial,
    location: navigateToTerritory(initial.location, territory.id, territory.structuralPath),
  };

  const selected = selectExplorerResponsibility(locatedElsewhere, 'http-entry-point');
  assert.equal(selected.location, locatedElsewhere.location);
  assert.equal(selected.location.currentTerritoryId, 'directory:apps/application/src');

  const switched = switchExplorerPerspective(selected, 'territory');
  const switchedBack = switchExplorerPerspective(switched, 'responsibility');
  assert.equal(switched.location, selected.location);
  assert.equal(switchedBack.location, selected.location);
  assert.equal(switchedBack.selectedResponsibility, 'http-entry-point');

  const located = locateResponsibilityFinding(switchedBack, finding, territories);
  assert.equal(located.perspective, 'territory');
  assert.equal(located.location.currentTerritoryId, 'directory:packages/library/src');
  assert.deepEqual(located.location.structuralPath, ['.', 'packages', 'library', 'src']);
  assert.equal(located.location.selectedItemId, 'packages/library/src/first.ts');
  assert.equal(located.selectedResponsibility, 'http-entry-point');
});

test('real NestJS and Prisma analysis composes factual findings with Territory context', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-explorer-responsibility-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', experimentalDecorators: true }, include: ['src/**/*.ts'] }));
  mkdirSync(path.join(projectPath, 'src'));
  writeFileSync(path.join(projectPath, 'src/users.ts'), "import { Controller, Get, UseGuards } from '@nestjs/common'; import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient(); class AuthGuard {} @Controller() class Users { @Get() @UseGuards(AuthGuard) async list() { return prisma.user.findMany(); } }\n");

  const target = analyzeTypeScriptTarget(projectPath);
  const graph = buildProjectGraph(target.analysis);
  const territories = createExplorerTerritoryProjection(buildProjectStructure(target.analysis), graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'));
  const projection = createExplorerResponsibilityProjection(target.responsibilities, territories);

  assert.equal(perspectiveFor(target.responsibilities), 'responsibility');
  assert.deepEqual(projection.groups.map((group) => group.family), ['interface', 'security', 'data']);
  assert.equal(projection.groups.every((group) => group.responsibilities.every((item) => item.territoryIds.includes('directory:src'))), true);
});

test('root projection contains direct factual territory children in canonical order', () => {
  const source = workspaceSource();
  const location = createInitialExplorerLocation(source.territories);
  const projection = createExplorerProjection(source, location);
  const expected = orderedTerritoryChildren(source.territories, null);

  assert.equal(location.currentTerritoryId, null);
  assert.equal(projection.mode, 'root');
  assert.deepEqual(projection.nodes.map((node) => node.id), expected.map((child) => child.kind === 'territory' ? child.territoryId : child.fileId));
  assert.equal(projection.nodes.every((node) => node.kind === 'territory' || node.kind === 'file'), true);
  assert.equal(projection.nodes.some((node) => node.kind === 'workspace-package'), false);
});

test('workspace package and directory territories use the same direct-child composition', () => {
  const source = workspaceSource();
  const packageId = 'workspace-package:packages/library';
  const directoryId = 'directory:apps/application/src';
  const packageTerritory = source.territories.territoriesById.get(packageId);
  const directoryTerritory = source.territories.territoriesById.get(directoryId);
  assert.ok(packageTerritory);
  assert.ok(directoryTerritory);
  if (!packageTerritory || !directoryTerritory) return;

  for (const territory of [packageTerritory, directoryTerritory]) {
    const location = navigateToTerritory(createInitialExplorerLocation(source.territories), territory.id, territory.structuralPath);
    const projection = createExplorerProjection(source, location);
    const expected = orderedTerritoryChildren(source.territories, territory.id);

    assert.equal(projection.mode, 'territory');
    assert.deepEqual(projection.nodes.map((node) => node.id), expected.map((child) => child.kind === 'territory' ? child.territoryId : child.fileId));
  }
});

test('workspace package Territory retains factual structural evidence without a special projection mode', () => {
  const source = workspaceSource();
  const territory = source.territories.territoriesById.get('workspace-package:packages/library');

  assert.equal(territory?.kind, 'workspace-package');
  assert.deepEqual(territory?.evidence, [
    { kind: 'workspace-configuration', path: 'pnpm-workspace.yaml' },
    { kind: 'workspace-pattern', pattern: 'packages/*' },
    { kind: 'package-manifest', path: 'packages/library/package.json' },
  ]);
});

test('territory navigation resets transients and Back resolves the structural parent', () => {
  const source = workspaceSource();
  const territory = source.territories.territoriesById.get('directory:apps/application/src');
  assert.ok(territory);
  if (!territory) return;
  const location = focusExplorerFile(selectExplorerItem(createInitialExplorerLocation(source.territories), 'apps/application/src/main.ts'), 'apps/application/src/main.ts');
  const entered = navigateToTerritory(location, territory.id, territory.structuralPath);
  const orientation = createExplorerOrientation(entered, source.territories, 'fixture', source.graph);
  const parent = parentExplorerTerritory(source.territories, territory.id);

  assert.equal(entered.selectedItemId, null);
  assert.equal(entered.focusedFileId, null);
  assert.deepEqual(entered.expandedItemIds, new Set());
  assert.ok(parent);
  if (!parent) return;
  assert.deepEqual(orientation.backAction?.destination, { territoryId: parent.id, structuralPath: parent.structuralPath });
});

test('search resolves the deepest factual territory and selects its file', () => {
  const source = workspaceSource();
  const destination = resolveExplorerSearchDestination({
    nodeId: 'packages/library/src/index.ts',
    fileName: 'index.ts',
    path: 'packages/library/src/index.ts',
  }, source.territories);

  assert.deepEqual(destination, {
    territoryId: 'directory:packages/library/src',
    structuralPath: ['.', 'packages', 'library', 'src'],
    itemId: 'packages/library/src/index.ts',
  });
  assert.ok(destination);
  if (!destination) return;
  const location = navigateToDestination(createInitialExplorerLocation(source.territories), destination);
  assert.equal(location.currentTerritoryId, destination.territoryId);
  assert.equal(location.selectedItemId, destination.itemId);
});

test('focused files retain direct factual relationship context and attention priority', () => {
  const source = workspaceSource();
  const territory = source.territories.territoriesById.get('directory:apps/application/src');
  assert.ok(territory);
  if (!territory) return;
  const focusedFileId = 'apps/application/src/main.ts';
  const location = focusExplorerFile(
    navigateToTerritory(createInitialExplorerLocation(source.territories), territory.id, territory.structuralPath),
    focusedFileId,
  );
  const projection = createExplorerProjection(source, location);
  const attention = createExplorerAttention(projection, location);

  assert.equal(projection.mode, 'focus');
  assert.equal(attention.nodes.get(focusedFileId)?.role, 'anchor');
  assert.equal([...attention.nodes.values()].some((node) => node.role === 'direct'), true);
});

test('stale territory navigation fails explicitly', () => {
  const source = workspaceSource();
  const location = navigateToTerritory(createInitialExplorerLocation(source.territories), 'directory:missing', ['.', 'missing']);

  assert.throws(() => createExplorerProjection(source, location), /Territory not found/);
});

test('generated snapshot remains a valid responsibility-aware Explorer input', () => {
  const snapshot: unknown = JSON.parse(readFileSync('apps/explorer-web/src/generated/analyzer-typescript.snapshot.json', 'utf8'));
  assert.equal(createExplorerRuntime(snapshot).kind, 'ready');
});
