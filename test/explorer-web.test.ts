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
  chooseInitialExplorerPerspective,
  createExplorerResponsibilityProjection,
  resolveOwningTerritory,
  type ExplorerPerspective,
} from '../apps/explorer-web/src/explorer-responsibility-projection.js';
import {
  createResponsibilitySpatialModel,
  RESPONSIBILITY_SUBJECT_PREVIEW_LIMIT,
} from '../apps/explorer-web/src/explorer-responsibility-spatial-model.js';
import { resolveExplorerSearchDestination } from '../apps/explorer-web/src/explorer-search.js';
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
  switchExplorerPerspective,
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

  const cleared = clearExplorerResponsibilitySelection(switchedBack);
  assert.equal(cleared.location, switchedBack.location);
  assert.equal(cleared.selectedResponsibility, null);
  assert.equal(cleared.selectedFindingId, null);

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
