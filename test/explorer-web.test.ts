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
import { buildProjectGraph, buildProjectStructure, type ProjectGraph } from '../packages/graph-engine/src/index.js';
import { createExplorerAttention } from '../apps/explorer-web/src/explorer-attention.js';
import { createExplorerOrientation } from '../apps/explorer-web/src/explorer-orientation.js';
import { createExplorerSystemOrientationProjection } from '../apps/explorer-web/src/explorer-system-orientation.js';
import { createExplorerSystemMapProjection } from '../apps/explorer-web/src/explorer-system-map-projection.js';
import {
  createExplorerSystemMapContextProjection,
  systemMapContextForItem,
} from '../apps/explorer-web/src/explorer-system-map-context.js';
import {
  createExplorerSystemMapResponsibilityOverlayProjection,
  systemMapResponsibilityOverlay,
} from '../apps/explorer-web/src/explorer-system-map-responsibility-overlay.js';
import {
  createSystemMapFieldModel,
  createSystemMapFieldRelationRoute,
  createSystemMapFieldSelection,
} from '../apps/explorer-web/src/explorer-system-map-field-model.js';
import {
  createExplorerProjection,
  type ExplorerProjection,
} from '../apps/explorer-web/src/explorer-projection.js';
import { createExplorerRuntime } from '../apps/explorer-web/src/explorer-runtime.js';
import {
  generateExplorerSnapshot,
  resolveExplorerSnapshotTarget,
} from '../apps/explorer-web/scripts/explorer-development-target.js';
import {
  createExplorerResponsibilityProjection,
  isResponsibilityPerspectiveEligible,
  resolveOwningTerritory,
  type ExplorerPerspective,
} from '../apps/explorer-web/src/explorer-responsibility-projection.js';
import {
  createResponsibilitySpatialModel,
  RESPONSIBILITY_SUBJECT_PREVIEW_LIMIT,
} from '../apps/explorer-web/src/explorer-responsibility-spatial-model.js';
import { resolveExplorerSearchDestination } from '../apps/explorer-web/src/explorer-search.js';
import { filterResponsibilityFindings } from '../apps/explorer-web/src/explorer-responsibility-details.js';
import { createSpatialTerritoryMapModel } from '../apps/explorer-web/src/explorer-spatial-territory-map.js';
import {
  createInitialExplorerLocation,
  focusExplorerFile,
  navigateToDestination,
  navigateToTerritory,
  selectExplorerItem,
} from '../apps/explorer-web/src/explorer-state.js';
import {
  clearExplorerResponsibilitySelection,
  createInitialExplorerViewState,
  locateResponsibilityFinding,
  selectExplorerResponsibility,
  selectSystemMapResponsibilityOverlay,
  switchExplorerSurface,
} from '../apps/explorer-web/src/explorer-view-state.js';
import {
  createExplorerTerritoryProjection,
  orderedTerritoryChildren,
  parentExplorerTerritory,
  type ExplorerTerritory,
  type TerritoryPreviewItem,
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

function spatialModelWithTerritories(
  entries: Array<{ id: string; label: string; analyzedFileCount: number; previewItems?: TerritoryPreviewItem[] }>,
) {
  const currentTerritory: ExplorerTerritory = {
    id: 'analysis-root:.',
    kind: 'system',
    structuralPath: ['.'],
    normalizedStructuralPath: '.',
    label: 'System',
    isDrillable: true,
    analyzedFileCount: entries.reduce((total, entry) => total + entry.analyzedFileCount, 0),
    directChildTerritoryCount: entries.length,
    previewItems: [],
    omittedPreviewItemCount: 0,
  };
  const territories: ExplorerTerritory[] = entries.map((entry) => ({
    id: entry.id,
    kind: 'directory',
    structuralPath: ['.', entry.label],
    normalizedStructuralPath: `./${entry.label}`,
    label: entry.label,
    isDrillable: true,
    analyzedFileCount: entry.analyzedFileCount,
    directChildTerritoryCount: entry.previewItems?.filter((item) => item.kind === 'territory').length ?? 0,
    previewItems: entry.previewItems ?? [],
    omittedPreviewItemCount: 0,
  }));
  const projection: ExplorerProjection = {
    mode: 'root',
    nodes: territories.map((territory) => ({ id: territory.id, kind: 'territory', territory })),
    edges: [],
    visibleNodeIds: new Set(territories.map((territory) => territory.id)),
  };

  return createSpatialTerritoryMapModel(projection, currentTerritory);
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

test('Responsibility finding filter matches factual subject, file, and evidence fields without reordering', () => {
  const createFinding = responsibilityFinding('http-entry-point', 'src/tasks.controller.ts', { id: 'finding:create', line: 20 });
  const first = {
    ...createFinding,
    subject: {
      ...createFinding.subject,
      name: 'TasksController.createTask',
    },
    evidence: [{
      ...createFinding.evidence[0]!,
      signal: '@Post("tasks")',
    }],
  };
  const statusFinding = responsibilityFinding('http-entry-point', 'src/status.controller.ts', { id: 'finding:status', line: 10 });
  const second = {
    ...statusFinding,
    subject: {
      ...statusFinding.subject,
      name: 'StatusController.list',
    },
  };
  const findings = [first, second];

  assert.deepEqual(filterResponsibilityFindings(findings, ''), findings);
  assert.deepEqual(filterResponsibilityFindings(findings, 'CREATE').map(({ id }) => id), ['finding:create']);
  assert.deepEqual(filterResponsibilityFindings(findings, 'tasks.controller').map(({ id }) => id), ['finding:create']);
  assert.deepEqual(filterResponsibilityFindings(findings, '@post("tasks")').map(({ id }) => id), ['finding:create']);
  assert.deepEqual(filterResponsibilityFindings(findings, 'controller').map(({ id }) => id), ['finding:create', 'finding:status']);
  assert.deepEqual(filterResponsibilityFindings(findings, 'criação'), []);
});

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
  return isResponsibilityPerspectiveEligible(result) ? 'responsibility' : 'territory';
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

test('System Orientation derives package directions, external module use, and structural observations from existing graph facts', () => {
  const { graph, structure } = workspaceSource();
  const orientation = createExplorerSystemOrientationProjection(graph, structure);

  assert.deepEqual(orientation.packageConnections, [{
    id: 'workspace-package:apps/application -> workspace-package:packages/library',
    source: { id: 'workspace-package:apps/application', label: '@fixture/application', rootPath: 'apps/application' },
    target: { id: 'workspace-package:packages/library', label: 'packages/library', rootPath: 'packages/library' },
    fileDependencyCount: 2,
  }]);
  assert.deepEqual(orientation.externalModules.map(({ fileEdges, ...usage }) => ({
    ...usage,
    fileEdgeIds: fileEdges.map((edge) => edge.id),
  })), [{
    moduleSpecifier: 'external-package',
    sourceFileIds: ['apps/application/src/main.ts'],
    sourcePackageIds: ['workspace-package:apps/application'],
    fileEdgeIds: graph.edges.filter((edge) => edge.dependencyKind === 'external').map((edge) => edge.id),
  }]);
  assert.deepEqual(orientation.cycles, []);
  assert.deepEqual(orientation.isolatedFiles, [
    { id: 'orphan.ts', path: 'orphan.ts' },
    { id: 'packages/isolated/src/isolated.ts', path: 'packages/isolated/src/isolated.ts' },
  ]);
  assert.deepEqual(orientation.unresolvedDependencies, []);
  assert.equal('importance' in orientation.packageConnections[0]!, false);
  assert.equal('layer' in orientation.packageConnections[0]!, false);
  assert.equal('core' in orientation.packageConnections[0]!, false);
});

test('System Orientation preserves cycle and unresolved-dependency observations without interpretation', () => {
  const { graph, structure } = workspaceSource();
  const edge = graph.edges.find((candidate) => candidate.sourceNodeId === 'packages/library/src/first.ts');
  assert.ok(edge);
  const observedGraph: ProjectGraph = {
    ...graph,
    edges: [...graph.edges, {
      ...edge,
      id: 'packages/library/src/second.ts -> packages/library/src/first.ts -> ./first.js -> 1:1',
      sourceNodeId: 'packages/library/src/second.ts',
      targetNodeId: 'packages/library/src/first.ts',
      moduleSpecifier: './first.js',
    }],
    unresolvedDependencies: [{
      id: 'orphan.ts -> ./missing.js ? 1:1',
      sourceNodeId: 'orphan.ts',
      moduleSpecifier: './missing.js',
      reason: 'relative-target-not-found',
      evidence: edge.evidence,
      confidence: edge.confidence,
    }],
  };

  const orientation = createExplorerSystemOrientationProjection(observedGraph, structure);

  assert.deepEqual(orientation.cycles, [{ fileIds: ['packages/library/src/first.ts', 'packages/library/src/second.ts', 'packages/library/src/first.ts'] }]);
  assert.deepEqual(orientation.unresolvedDependencies.map(({ dependency, ...observation }) => ({
    ...observation,
    evidence: dependency.evidence,
    confidence: dependency.confidence,
  })), [{
    id: 'orphan.ts -> ./missing.js ? 1:1',
    sourceFileId: 'orphan.ts',
    moduleSpecifier: './missing.js',
    reason: 'relative-target-not-found',
    evidence: edge.evidence,
    confidence: edge.confidence,
  }]);
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

test('only behavioral factual responsibility families qualify the Responsibility lens', () => {
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

test('responsibility spatial presentation preserves canonical facts with bounded deterministic previews', () => {
  const source = workspaceSource();
  const findings = [
    responsibilityFinding('framework-wiring', 'packages/library/src/second.ts', { id: 'finding:wiring', kind: 'file' }),
    responsibilityFinding('persistence-interaction', 'packages/library/src/first.ts', { id: 'finding:persistence', kind: 'function' }),
    responsibilityFinding('access-control', 'apps/application/src/main.ts', { id: 'finding:access', kind: 'class' }),
    responsibilityFinding('http-entry-point', 'packages/library/src/second.ts', { id: 'finding:http-4', kind: 'file', line: 4 }),
    responsibilityFinding('http-entry-point', 'packages/library/src/first.ts', { id: 'finding:http-3', kind: 'function', line: 3 }),
    responsibilityFinding('http-entry-point', 'apps/application/src/main.ts', { id: 'finding:http-2', kind: 'class', line: 2 }),
    responsibilityFinding('http-entry-point', 'apps/application/src/main.ts', { id: 'finding:http-1', kind: 'method', line: 1 }),
  ];
  const projection = createExplorerResponsibilityProjection(responsibilityResult(findings), source.territories);
  const model = createResponsibilitySpatialModel(projection);

  assert.equal(model.composition, 'constellation');
  assert.deepEqual(model.familyRegions.map((region) => region.family), ['interface', 'security', 'data', 'composition']);
  assert.deepEqual(
    model.familyRegions.flatMap((region) => region.responsibilities.map(({ item }) => item.responsibility)),
    ['http-entry-point', 'access-control', 'persistence-interaction', 'framework-wiring'],
  );
  const http = model.familyRegions[0]?.responsibilities[0];
  assert.equal(http?.item.subjectCount, 4);
  assert.equal(http?.item.findings.length, 4);
  assert.equal(http?.subjectPreviews.length, RESPONSIBILITY_SUBJECT_PREVIEW_LIMIT);
  assert.equal(http?.omittedSubjectCount, 1);
  assert.deepEqual(
    http?.subjectPreviews.map((finding) => finding.id),
    http?.item.findings.slice(0, RESPONSIBILITY_SUBJECT_PREVIEW_LIMIT).map((finding) => finding.id),
  );
  assert.equal('edges' in model, false);

  const sameFamiliesDifferentFacts = createExplorerResponsibilityProjection(
    responsibilityResult(findings.map((finding, index) => ({
      ...finding,
      id: `renamed:${index}`,
      subject: { ...finding.subject, id: `renamed-subject:${index}` },
    }))),
    source.territories,
  );
  assert.equal(createResponsibilitySpatialModel(sameFamiliesDifferentFacts).composition, model.composition);
  assert.deepEqual(createResponsibilitySpatialModel(projection), model);
});

test('Explorer view state always starts in Overview independently from Responsibility eligibility', () => {
  const territories = workspaceSource().territories;
  const qualifying = responsibilityResult([
    responsibilityFinding('http-entry-point', 'apps/application/src/main.ts'),
  ]);
  const wiringOnly = responsibilityResult([
    responsibilityFinding('framework-wiring', 'apps/application/src/main.ts'),
  ]);

  assert.equal(createInitialExplorerViewState(territories).surface, 'overview');
  assert.equal(isResponsibilityPerspectiveEligible(qualifying), true);
  assert.equal(isResponsibilityPerspectiveEligible(wiringOnly), false);
  assert.equal(isResponsibilityPerspectiveEligible(responsibilityResult([])), false);
});

test('System Map projects direct src Territories, direct files, and traceable cross-item dependencies deterministically', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-system-map-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  mkdirSync(path.join(projectPath, 'src', 'auth'), { recursive: true });
  mkdirSync(path.join(projectPath, 'src', 'prisma'), { recursive: true });
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  writeFileSync(path.join(projectPath, 'src', 'prisma', 'one.ts'), 'export const one = 1;\n');
  writeFileSync(path.join(projectPath, 'src', 'prisma', 'two.ts'), 'export const two = 2;\n');
  writeFileSync(path.join(projectPath, 'src', 'root.ts'), 'export const root = 0;\n');
  writeFileSync(path.join(projectPath, 'src', 'auth', 'b.ts'), "import '../prisma/one'; import '../root'; export const b = 1;\n");
  writeFileSync(path.join(projectPath, 'src', 'auth', 'a.ts'), "import './b'; import '../prisma/one'; import '../prisma/two'; export const a = 1;\n");
  writeFileSync(path.join(projectPath, 'src', 'app.module.ts'), "import './root'; export const app = 1;\n");
  writeFileSync(path.join(projectPath, 'src', 'main.ts'), "import './auth/a'; import './app.module'; export const main = 1;\n");

  const analysis = analyzeProject(projectPath);
  const graph = buildProjectGraph(analysis);
  const territories = createExplorerTerritoryProjection(
    buildProjectStructure(analysis),
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  );
  const projection = createExplorerSystemMapProjection(graph, territories);
  assert.equal(projection.status, 'ready');
  if (projection.status !== 'ready') return;

  assert.equal(projection.sourceTerritory.normalizedStructuralPath, './src');
  assert.deepEqual(projection.items.map(({ id, kind }) => ({ id, kind })), [
    { id: 'src/app.module.ts', kind: 'file' },
    { id: 'directory:src/auth', kind: 'territory' },
    { id: 'src/main.ts', kind: 'file' },
    { id: 'directory:src/prisma', kind: 'territory' },
    { id: 'src/root.ts', kind: 'file' },
  ]);
  assert.equal(projection.items.filter((item) => item.kind === 'file').every((item) => item.file.kind === 'file'), true);

  const relationSummary = projection.relations.map((relation) => ({
    source: relation.sourceItemId,
    target: relation.targetItemId,
    count: relation.observedDependencyCount,
  }));
  assert.deepEqual(relationSummary, [
    { source: 'directory:src/auth', target: 'directory:src/prisma', count: 3 },
    { source: 'directory:src/auth', target: 'src/root.ts', count: 1 },
    { source: 'src/app.module.ts', target: 'src/root.ts', count: 1 },
    { source: 'src/main.ts', target: 'directory:src/auth', count: 1 },
    { source: 'src/main.ts', target: 'src/app.module.ts', count: 1 },
  ]);
  assert.equal(projection.relations.some((relation) => relation.sourceItemId === relation.targetItemId), false);
  assert.equal(projection.relations.some((relation) => relation.fileEdges.some((edge) => edge.sourceNodeId === 'src/auth/a.ts' && edge.targetNodeId === 'src/auth/b.ts')), false);

  const authToPrisma = projection.relations.find((relation) => (
    relation.sourceItemId === 'directory:src/auth' && relation.targetItemId === 'directory:src/prisma'
  ));
  assert.ok(authToPrisma);
  assert.equal(authToPrisma.observedDependencyCount, authToPrisma.fileEdges.length);
  assert.deepEqual(
    authToPrisma.fileEdges,
    graph.edges.filter((edge) => edge.sourceNodeId.startsWith('src/auth/') && edge.targetNodeId.startsWith('src/prisma/')).sort((left, right) => left.id.localeCompare(right.id)),
  );
  assert.equal(authToPrisma.fileEdges.every((edge) => edge.evidence.location.filePath === edge.sourceNodeId), true);

  const reordered = createExplorerSystemMapProjection(
    { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() },
    territories,
  );
  assert.equal(reordered.status, 'ready');
  if (reordered.status !== 'ready') return;
  assert.deepEqual(reordered.items.map(({ id, kind }) => ({ id, kind })), projection.items.map(({ id, kind }) => ({ id, kind })));
  assert.deepEqual(
    reordered.relations.map((relation) => ({ id: relation.id, fileEdgeIds: relation.fileEdges.map((edge) => edge.id) })),
    projection.relations.map((relation) => ({ id: relation.id, fileEdgeIds: relation.fileEdges.map((edge) => edge.id) })),
  );

  const field = createSystemMapFieldModel(projection);
  const reorderedField = createSystemMapFieldModel(reordered);
  assert.deepEqual(
    field.items.map(({ item, position }) => ({ id: item.id, kind: item.kind, position })),
    reorderedField.items.map(({ item, position }) => ({ id: item.id, kind: item.kind, position })),
  );
  assert.equal(field.relations, projection.relations);
  assert.equal(field.items.filter(({ item }) => item.kind === 'file').every(({ item }) => item.kind === 'file' && item.file.kind === 'file'), true);
  const authToPrismaRoute = createSystemMapFieldRelationRoute(field, authToPrisma);
  assert.deepEqual(authToPrismaRoute, { sourceSide: 'right', targetSide: 'left' });
  const mainToAuth = projection.relations.find((relation) => (
    relation.sourceItemId === 'src/main.ts' && relation.targetItemId === 'directory:src/auth'
  ));
  assert.ok(mainToAuth);
  assert.deepEqual(createSystemMapFieldRelationRoute(field, mainToAuth), { sourceSide: 'left', targetSide: 'right' });
  assert.deepEqual(createSystemMapFieldRelationRoute(field, {
    ...authToPrisma,
    sourceItemId: 'directory:src/prisma',
    targetItemId: 'src/main.ts',
  }), { sourceSide: 'bottom', targetSide: 'top' });

  const positionsBeforeSelection = field.items.map(({ item, position }) => ({ id: item.id, position }));
  const authSelection = createSystemMapFieldSelection(field, 'directory:src/auth');
  assert.deepEqual(
    [...authSelection.relationDirections.values()].sort(),
    ['incoming', 'outgoing', 'outgoing'],
  );
  assert.equal(authSelection.itemAttention.get('src/main.ts'), 'incoming');
  assert.equal(authSelection.itemAttention.get('directory:src/prisma'), 'outgoing');
  assert.equal(authSelection.itemAttention.get('src/root.ts'), 'outgoing');
  assert.deepEqual(field.items.map(({ item, position }) => ({ id: item.id, position })), positionsBeforeSelection);

  const rootSelection = createSystemMapFieldSelection(field, 'src/root.ts');
  assert.deepEqual([...rootSelection.relationDirections.values()].sort(), ['incoming', 'incoming']);
  assert.equal(rootSelection.itemAttention.get('directory:src/auth'), 'incoming');
  assert.equal(rootSelection.itemAttention.get('src/app.module.ts'), 'incoming');
  const clearedSelection = createSystemMapFieldSelection(field, null);
  assert.equal([...clearedSelection.relationDirections].length, 0);
  assert.equal([...clearedSelection.itemAttention.values()].every((attention) => attention === 'resting'), true);
});

test('System Map context localizes secondary facts without changing structural geography', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-system-map-context-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  mkdirSync(path.join(projectPath, 'src', 'auth'), { recursive: true });
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  writeFileSync(path.join(projectPath, 'src', 'auth', 'a.ts'), "import 'external-package'; import './b'; export const a = 1;\n");
  writeFileSync(path.join(projectPath, 'src', 'auth', 'b.ts'), "import './a'; import './missing'; export const b = 1;\n");
  writeFileSync(path.join(projectPath, 'src', 'main.ts'), "import 'other-package'; export const main = 1;\n");
  writeFileSync(path.join(projectPath, 'src', 'isolated.ts'), 'export const isolated = 1;\n');

  const analysis = analyzeProject(projectPath);
  const graph = buildProjectGraph(analysis);
  const structure = buildProjectStructure(analysis);
  const territories = createExplorerTerritoryProjection(
    structure,
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  );
  const systemMap = createExplorerSystemMapProjection(graph, territories);
  assert.equal(systemMap.status, 'ready');
  if (systemMap.status !== 'ready') return;

  const responsibilityResultWithLimits: ResponsibilityAnalysisResult = {
    ...responsibilityResult([], [
      { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'partially-evaluated', limitationIds: ['limit:http'] },
      { capability: 'graphql-entry-point', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] },
      { capability: 'access-control', scope: { kind: 'file', fileId: 'src/auth/a.ts' }, status: 'failed', failure: { code: 'test-failure', message: 'Detector could not finish.' }, limitationIds: [] },
      { capability: 'cache-interaction', scope: { kind: 'file', fileId: 'src/main.ts' }, status: 'unsupported' },
      { capability: 'scheduled-job', scope: { kind: 'file', fileId: 'src/isolated.ts' }, status: 'not-evaluated' },
    ]),
    limitations: [{ id: 'limit:http', scope: { kind: 'project' }, code: 'partial-test', message: 'Only supported HTTP declarations were evaluated.' }],
  };
  const responsibilityProjection = createExplorerResponsibilityProjection(responsibilityResultWithLimits, territories);
  const positions = createSystemMapFieldModel(systemMap).items.map(({ item, position }) => ({ id: item.id, position }));
  const projected = createExplorerSystemMapContextProjection(
    systemMap,
    createExplorerSystemOrientationProjection(graph, structure),
    responsibilityProjection,
    responsibilityResultWithLimits.limitations,
    territories,
  );

  assert.deepEqual(projected.externalTouchpoints.map(({ moduleSpecifier, sources }) => ({
    moduleSpecifier,
    itemIds: sources.map((source) => source.itemId),
    files: sources.map((source) => source.fileId),
  })), [
    { moduleSpecifier: 'external-package', itemIds: ['directory:src/auth'], files: ['src/auth/a.ts'] },
    { moduleSpecifier: 'other-package', itemIds: ['src/main.ts'], files: ['src/main.ts'] },
  ]);
  assert.equal(systemMap.items.some((item) => item.id.startsWith('external:')), false);
  assert.equal(projected.externalTouchpoints[0]?.sources[0]?.edge.evidence.location.filePath, 'src/auth/a.ts');
  assert.deepEqual(projected.analysisLimits.map(({ coverage }) => coverage.status), [
    'partially-evaluated', 'failed', 'unsupported', 'not-evaluated',
  ]);
  assert.equal(projected.analysisLimits.some(({ coverage }) => coverage.status === 'evaluated'), false);
  assert.deepEqual(projected.analysisLimits[0]?.limitations.map(({ id }) => id), ['limit:http']);
  assert.equal(projected.unresolvedDependencies[0]?.itemId, 'directory:src/auth');
  assert.deepEqual(projected.unresolvedDependencies[0]?.dependency, graph.unresolvedDependencies[0]);
  assert.deepEqual(projected.cycles[0]?.itemIds, ['directory:src/auth']);
  assert.deepEqual(projected.isolatedFiles, [{ itemId: 'src/isolated.ts', fileId: 'src/isolated.ts' }]);

  const authContext = systemMapContextForItem(projected, 'directory:src/auth');
  assert.deepEqual(authContext.externalTouchpoints.map(({ moduleSpecifier }) => moduleSpecifier), ['external-package']);
  assert.deepEqual(authContext.analysisLimits.map(({ coverage }) => coverage.status), ['partially-evaluated', 'failed']);
  assert.equal(authContext.unresolvedDependencies.length, 1);
  assert.equal(authContext.cycles.length, 1);
  assert.equal(authContext.isolatedFiles.length, 0);
  assert.equal('architecture' in projected, false);
  assert.equal('integration' in projected.externalTouchpoints[0]!, false);
  assert.deepEqual(createSystemMapFieldModel(systemMap).items.map(({ item, position }) => ({ id: item.id, position })), positions);

  const empty = createExplorerSystemMapContextProjection(
    systemMap,
    { packageConnections: [], externalModules: [], cycles: [], isolatedFiles: [], unresolvedDependencies: [] },
    createExplorerResponsibilityProjection(responsibilityResult([], [
      { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] },
    ]), territories),
    [],
    territories,
  );
  assert.deepEqual(empty, { externalTouchpoints: [], analysisLimits: [], unresolvedDependencies: [], cycles: [], isolatedFiles: [] });
});

test('System Map Responsibility overlay preserves factual findings and structural geography deterministically', (context) => {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-system-map-overlay-'));
  context.after(() => rmSync(projectPath, { recursive: true, force: true }));
  mkdirSync(path.join(projectPath, 'src', 'auth'), { recursive: true });
  mkdirSync(path.join(projectPath, 'src', 'data'), { recursive: true });
  writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  writeFileSync(path.join(projectPath, 'src', 'auth', 'controller.ts'), 'export const controller = 1;\n');
  writeFileSync(path.join(projectPath, 'src', 'auth', 'guard.ts'), 'export const guard = 1;\n');
  writeFileSync(path.join(projectPath, 'src', 'data', 'store.ts'), 'export const store = 1;\n');
  writeFileSync(path.join(projectPath, 'src', 'main.ts'), 'export const main = 1;\n');

  const analysis = analyzeProject(projectPath);
  const graph = buildProjectGraph(analysis);
  const territories = createExplorerTerritoryProjection(
    buildProjectStructure(analysis),
    graph.nodes.filter((node): node is Extract<typeof node, { kind: 'file' }> => node.kind === 'file'),
  );
  const systemMap = createExplorerSystemMapProjection(graph, territories);
  assert.equal(systemMap.status, 'ready');
  if (systemMap.status !== 'ready') return;

  const findings = [
    responsibilityFinding('http-entry-point', 'src/auth/guard.ts', { id: 'finding:http:guard', line: 5 }),
    responsibilityFinding('http-entry-point', 'src/main.ts', { id: 'finding:http:main', kind: 'file', line: 1 }),
    responsibilityFinding('http-entry-point', 'src/auth/controller.ts', { id: 'finding:http:controller', line: 2 }),
    responsibilityFinding('persistence-interaction', 'src/data/store.ts', { id: 'finding:persistence', line: 9 }),
  ];
  const responsibilityProjection = createExplorerResponsibilityProjection(responsibilityResult(findings), territories);
  const overlays = createExplorerSystemMapResponsibilityOverlayProjection(systemMap, responsibilityProjection, territories);
  const reordered = createExplorerSystemMapResponsibilityOverlayProjection(
    systemMap,
    createExplorerResponsibilityProjection(responsibilityResult([...findings].reverse()), territories),
    territories,
  );
  const http = systemMapResponsibilityOverlay(overlays, 'http-entry-point');
  assert.ok(http);
  if (!http) return;

  assert.deepEqual(overlays, reordered);
  assert.deepEqual(overlays.overlays.map(({ responsibility }) => responsibility), [
    'http-entry-point',
    'persistence-interaction',
  ]);
  assert.equal(http.findingCount, 3);
  assert.deepEqual(http.locations.map(({ itemId, findingCount }) => ({ itemId, findingCount })), [
    { itemId: 'directory:src/auth', findingCount: 2 },
    { itemId: 'src/main.ts', findingCount: 1 },
  ]);
  assert.equal(http.locations.some(({ itemId }) => itemId === 'directory:src/data'), false);
  assert.deepEqual(http.locations[0]?.findings, [findings[2], findings[0]]);
  assert.deepEqual(http.locations[0]?.fileIds, ['src/auth/controller.ts', 'src/auth/guard.ts']);
  assert.deepEqual(http.locations[0]?.subjectIds, [findings[2]?.subject.id, findings[0]?.subject.id].sort());
  assert.deepEqual(http.locations[0]?.evidenceIds, [findings[2]?.evidence[0]?.id, findings[0]?.evidence[0]?.id].sort());
  assert.deepEqual(http.locations[1]?.findings[0]?.evidence, findings[1]?.evidence);

  const positions = createSystemMapFieldModel(systemMap).items.map(({ item, position }) => ({ id: item.id, position }));
  const selection = createSystemMapFieldSelection(createSystemMapFieldModel(systemMap), 'directory:src/auth');
  const moreFindings = createExplorerSystemMapResponsibilityOverlayProjection(
    systemMap,
    createExplorerResponsibilityProjection(responsibilityResult([
      ...findings,
      responsibilityFinding('http-entry-point', 'src/auth/controller.ts', { id: 'finding:http:extra', line: 12 }),
    ]), territories),
    territories,
  );
  assert.equal(systemMapResponsibilityOverlay(moreFindings, 'http-entry-point')?.findingCount, 4);
  assert.deepEqual(createSystemMapFieldModel(systemMap).items.map(({ item, position }) => ({ id: item.id, position })), positions);
  assert.equal(selection.itemAttention.get('directory:src/auth'), 'selected');
  assert.equal(systemMapResponsibilityOverlay(overlays, null), null);
});

test('perspective and Responsibility selection preserve structural location until factual Locate', () => {
  const territories = workspaceSource().territories;
  const finding = responsibilityFinding('http-entry-point', 'packages/library/src/first.ts');
  const responsibilities = responsibilityResult([finding]);
  const initial = createInitialExplorerViewState(territories);
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

  const withOverlay = selectSystemMapResponsibilityOverlay(selected, 'http-entry-point');
  assert.equal(withOverlay.location, selected.location);
  assert.equal(withOverlay.selectedResponsibility, selected.selectedResponsibility);
  assert.equal(withOverlay.systemMapResponsibilityOverlay, 'http-entry-point');

  const overviewFromSelection = switchExplorerSurface(withOverlay, 'overview');
  const switched = switchExplorerSurface(overviewFromSelection, 'territory');
  const switchedBack = switchExplorerSurface(switched, 'responsibility');
  assert.equal(overviewFromSelection.location, selected.location);
  assert.equal(switched.location, selected.location);
  assert.equal(switchedBack.location, selected.location);
  assert.equal(switchedBack.selectedResponsibility, 'http-entry-point');
  assert.equal(switchedBack.systemMapResponsibilityOverlay, 'http-entry-point');

  const cleared = clearExplorerResponsibilitySelection(switchedBack);
  assert.equal(cleared.location, switchedBack.location);
  assert.equal(cleared.selectedResponsibility, null);
  assert.equal(cleared.selectedFindingId, null);

  const located = locateResponsibilityFinding(switchedBack, finding, territories);
  assert.equal(located.surface, 'territory');
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

test('spatial map exposes only direct structural children and factual nested previews', () => {
  const source = workspaceSource();
  const rootLocation = createInitialExplorerLocation(source.territories);
  const rootModel = createSpatialTerritoryMapModel(
    createExplorerProjection(source, rootLocation),
    source.territories.system,
  );

  assert.equal(rootModel.scale, 'system');
  assert.deepEqual(
    rootModel.territories.map((item) => item.territory.id),
    ['workspace-package:apps/application', 'directory:packages'],
  );
  assert.deepEqual(
    rootModel.territories.find((item) => item.territory.id === 'directory:packages')?.previewItems.map((item) => (
      item.kind === 'territory' ? item.territoryId : item.fileId
    )),
    ['workspace-package:packages/empty', 'workspace-package:packages/isolated', 'workspace-package:packages/library'],
  );
  assert.equal('edges' in rootModel, false);

  const packages = source.territories.territoriesById.get('directory:packages');
  assert.ok(packages);
  if (!packages) return;
  const territoryLocation = navigateToTerritory(rootLocation, packages.id, packages.structuralPath);
  const territoryModel = createSpatialTerritoryMapModel(
    createExplorerProjection(source, territoryLocation),
    packages,
  );

  assert.equal(territoryModel.scale, 'territory');
  assert.deepEqual(
    territoryModel.territories.map((item) => item.territory.id),
    ['workspace-package:packages/empty', 'workspace-package:packages/isolated', 'workspace-package:packages/library'],
  );
  assert.equal('edges' in territoryModel, false);
});

test('spatial map composition is deterministic, neutral, and keeps preview kinds distinct', () => {
  assert.equal(spatialModelWithTerritories([{ id: 'one', label: 'one', analyzedFileCount: 100 }]).composition, 'single');
  assert.equal(spatialModelWithTerritories([
    { id: 'one', label: 'one', analyzedFileCount: 1 },
    { id: 'two', label: 'two', analyzedFileCount: 200 },
  ]).composition, 'pair');
  assert.equal(spatialModelWithTerritories([
    { id: 'first', label: 'backend', analyzedFileCount: 1 },
    { id: 'second', label: 'api', analyzedFileCount: 900 },
    { id: 'third', label: 'web', analyzedFileCount: 2 },
  ]).composition, 'triad');
  assert.equal(spatialModelWithTerritories([
    { id: 'one', label: 'one', analyzedFileCount: 1 },
    { id: 'two', label: 'two', analyzedFileCount: 2 },
    { id: 'three', label: 'three', analyzedFileCount: 3 },
    { id: 'four', label: 'four', analyzedFileCount: 4 },
  ]).composition, 'field');

  const previews: TerritoryPreviewItem[] = [
    { kind: 'territory', territoryId: 'child:src', structuralPath: ['.', 'src'], label: 'src', isDrillable: true },
    { kind: 'file', fileId: 'entry.ts', structuralPath: ['.', 'entry.ts'], label: 'entry.ts' },
  ];
  const model = spatialModelWithTerritories([{ id: 'one', label: 'one', analyzedFileCount: 5, previewItems: previews }]);
  const changedNamesAndCounts = spatialModelWithTerritories([
    { id: 'one', label: 'server', analyzedFileCount: 1000 },
    { id: 'two', label: 'frontend', analyzedFileCount: 1 },
    { id: 'three', label: 'api', analyzedFileCount: 50 },
  ]);
  const repeated = spatialModelWithTerritories([{ id: 'one', label: 'one', analyzedFileCount: 5, previewItems: previews }]);

  assert.deepEqual(model.territories[0]?.childTerritoryPreviews, [previews[0]]);
  assert.deepEqual(model.territories[0]?.filePreviews, [previews[1]]);
  assert.equal(changedNamesAndCounts.composition, 'triad');
  assert.deepEqual(model, repeated);
  assert.equal('edges' in model, false);
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

test('a root-level file can enter relationship focus without inventing a Territory', () => {
  const source = workspaceSource();
  const focusedFileId = 'orphan.ts';
  const location = focusExplorerFile(createInitialExplorerLocation(source.territories), focusedFileId);
  const projection = createExplorerProjection(source, location);

  assert.equal(location.currentTerritoryId, null);
  assert.deepEqual(location.structuralPath, ['.']);
  assert.equal(projection.mode, 'focus');
  assert.equal(projection.nodes.some((node) => node.id === focusedFileId), true);
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

test('Explorer development target resolves a relative or absolute directory and defaults explicitly', (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-explorer-target-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const defaultTarget = path.join(root, 'default-project');
  const explicitTarget = path.join(root, 'explicit-project');
  mkdirSync(defaultTarget);
  mkdirSync(explicitTarget);
  writeFileSync(path.join(defaultTarget, 'tsconfig.json'), '{}');
  writeFileSync(path.join(explicitTarget, 'tsconfig.json'), '{}');
  const executionDirectory = path.join(root, 'commands');
  mkdirSync(executionDirectory);

  assert.equal(
    resolveExplorerSnapshotTarget([], { cwd: executionDirectory, defaultTarget }).projectDirectory,
    defaultTarget,
  );
  assert.equal(
    resolveExplorerSnapshotTarget(['../explicit-project'], { cwd: executionDirectory, defaultTarget }).projectDirectory,
    explicitTarget,
  );
  assert.equal(
    resolveExplorerSnapshotTarget([explicitTarget], { cwd: executionDirectory, defaultTarget }).projectDirectory,
    explicitTarget,
  );
  assert.equal(
    resolveExplorerSnapshotTarget(['--', '../explicit-project'], { cwd: executionDirectory, defaultTarget }).projectDirectory,
    explicitTarget,
  );
});

test('Explorer snapshot generation validates its target and keeps analysis and responsibilities synchronized', (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-explorer-snapshot-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repository');
  const target = path.join(repository, 'target-project');
  const commands = path.join(root, 'commands');
  const outputPath = path.join(root, 'snapshot.json');
  mkdirSync(path.join(target, 'src'), { recursive: true });
  mkdirSync(commands);
  writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'target-project-label' }));
  writeFileSync(path.join(target, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['src/**/*.ts'] }));
  writeFileSync(path.join(target, 'src', 'entry.ts'), 'export const entry = 1;\n');
  writeFileSync(path.join(root, 'not-a-directory'), 'file');

  const snapshot = generateExplorerSnapshot({
    args: ['../repository'],
    cwd: commands,
    defaultTarget: repository,
    outputPath,
  });

  assert.equal(snapshot.projectLabel, 'target-project-label');
  assert.equal(snapshot.analysis.files.length, 1);
  assert.equal(snapshot.analysis.projectPath, snapshot.responsibilities.projectPath);
  assert.equal(createExplorerRuntime(snapshot).kind, 'ready');
  assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), snapshot);
  assert.throws(
    () => resolveExplorerSnapshotTarget(['missing'], { cwd: commands, defaultTarget: repository }),
    /Explorer target does not exist: .*missing/,
  );
  assert.throws(
    () => resolveExplorerSnapshotTarget([path.join(root, 'not-a-directory')], { cwd: commands, defaultTarget: repository }),
    /Explorer target is not a directory:/,
  );
});

test('Explorer development target reports repository ambiguity without choosing a candidate', (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-explorer-ambiguity-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repository');
  mkdirSync(path.join(repository, 'zeta'), { recursive: true });
  mkdirSync(path.join(repository, 'alpha'), { recursive: true });
  writeFileSync(path.join(repository, 'zeta', 'tsconfig.json'), '{}');
  writeFileSync(path.join(repository, 'alpha', 'tsconfig.json'), '{}');

  assert.throws(
    () => resolveExplorerSnapshotTarget([repository], { cwd: root, defaultTarget: repository }),
    new Error([
      `Multiple supported TypeScript analysis targets were found under ${repository}:`,
      '- alpha',
      '- zeta',
      'Provide one target directory explicitly.',
    ].join('\n')),
  );
});
