import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeProject } from '../packages/analyzer-typescript/src/index.js';
import { extractExactInternalInvocationRelations } from '../packages/analyzer-typescript/src/invocation-relations.js';
import { createTypeScriptAnalysisSession } from '../packages/analyzer-typescript/src/typescript-analysis-session.js';
import { buildProjectGraph, createProjectDiagnostics } from '../packages/graph-engine/src/index.js';

const fixturePath = path.resolve('fixtures/simple-import');

function createTempProject(context: { after: (callback: () => void) => void }): string {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), 'bunkercode-analyzer-'));

  context.after(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  return projectPath;
}

function writeProjectFile(projectPath: string, filePath: string, content: string): void {
  const absolutePath = path.join(projectPath, filePath);

  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function dependencySummary(result: ReturnType<typeof analyzeProject>) {
  return result.dependencies.map(({ sourceFileId, targetFileId, moduleSpecifier, kind, confidence }) => {
    const summary = {
      sourceFileId,
      moduleSpecifier,
      kind,
      confidence,
    };

    return targetFileId ? { ...summary, targetFileId } : summary;
  });
}

function callRange(fileId: string, line: number, column: number, text: string) {
  return {
    fileId,
    start: { line, column },
    end: { line, column: column + text.length },
  };
}

function invocationSummary(extraction: ReturnType<typeof extractExactInternalInvocationRelations>) {
  return extraction.exactRelations.map(({ caller, callee, callSite, confidence }) => ({
    caller: { id: caller.id, fileId: caller.fileId, name: caller.name, kind: 'kind' in caller ? caller.kind : undefined },
    callee: { id: callee.id, fileId: callee.fileId, name: callee.name, kind: 'kind' in callee ? callee.kind : undefined },
    callSite,
    confidence,
  }));
}

function astRange(
  fileId: string,
  node: {
    getSourceFile(): { getLineAndColumnAtPos(position: number): { line: number; column: number } };
    getStart(): number;
    getEnd(): number;
  },
) {
  const sourceFile = node.getSourceFile();
  return {
    fileId,
    start: sourceFile.getLineAndColumnAtPos(node.getStart()),
    end: sourceFile.getLineAndColumnAtPos(node.getEnd()),
  };
}

test('analyze simple-import deterministically', () => {
  const first = analyzeProject(fixturePath);
  const second = analyzeProject(fixturePath);
  const [importEntry] = first.dependencies;

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.deepEqual(first.analyzer, {
    name: '@bunker-code/analyzer-typescript',
    language: 'typescript',
  });
  assert.equal(first.projectPath, '.');
  assert.equal(first.tsconfigPath, 'tsconfig.json');
  assert.equal(first.workspaceConfigurationPath, undefined);
  assert.equal(first.files.length, 2);
  assert.deepEqual(first.files, [
    { id: 'src/main.ts', path: 'src/main.ts' },
    { id: 'src/service.ts', path: 'src/service.ts' },
  ]);
  assert.equal(first.dependencies.length, 1);
  assert.ok(importEntry);
  assert.deepEqual(importEntry.sourceFileId, 'src/main.ts');
  assert.deepEqual(importEntry.moduleSpecifier, './service');
  assert.deepEqual(importEntry.targetFileId, 'src/service.ts');
  assert.equal(importEntry.kind, 'internal');
  assert.equal(importEntry.confidence, 'exact');
  assert.deepEqual(importEntry.evidence.location.filePath, 'src/main.ts');
  assert.equal(importEntry.evidence.location.line > 0, true);
  assert.equal(importEntry.evidence.location.column > 0, true);
  assert.deepEqual(first.unresolvedDependencies, []);
  assert.deepEqual(first.diagnostics, []);
});

test('extracts the exact imported function invocation in simple-import deterministically', () => {
  const session = createTypeScriptAnalysisSession(fixturePath, [path.join(fixturePath, 'tsconfig.json')], () => true);
  const first = extractExactInternalInvocationRelations(session);
  const second = extractExactInternalInvocationRelations(session);

  assert.deepEqual(first, second);
  assert.deepEqual(invocationSummary(first), [{
    caller: { id: 'experimental-invocation:function:src/main.ts:38', fileId: 'src/main.ts', name: 'main', kind: undefined },
    callee: { id: 'experimental-invocation:function:src/service.ts:0', fileId: 'src/service.ts', name: 'service', kind: undefined },
    callSite: callRange('src/main.ts', 4, 10, 'service()'),
    confidence: 'exact',
  }]);
  assert.deepEqual(first.unclassifiedCalls, []);
});

test('extracts exact local and renamed imported function invocations deterministically', (context) => {
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true }, include: ['src/**/*.ts'] }),
  );
  writeProjectFile(
    projectPath,
    'src/main.ts',
    [
      "import { service as renamedService } from './service';",
      '',
      "function helper(): string { return 'local'; }",
      '',
      'export function main(): string {',
      '  return `${helper()}${renamedService()}`;',
      '}',
      '',
    ].join('\n'),
  );
  writeProjectFile(projectPath, 'src/service.ts', "export function service(): string { return 'imported'; }\n");

  const session = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);
  const first = extractExactInternalInvocationRelations(session);
  const second = extractExactInternalInvocationRelations(session);

  assert.deepEqual(first, second);
  assert.deepEqual(first.unclassifiedCalls, []);
  assert.deepEqual(
    first.exactRelations.map(({ caller, callee, callSite, confidence }) => ({
      caller: { fileId: caller.fileId, name: caller.name },
      callee: { fileId: callee.fileId, name: callee.name },
      callSite,
      confidence,
    })),
    [
      {
        caller: { fileId: 'src/main.ts', name: 'main' },
        callee: { fileId: 'src/main.ts', name: 'helper' },
        callSite: callRange('src/main.ts', 6, 13, 'helper()'),
        confidence: 'exact',
      },
      {
        caller: { fileId: 'src/main.ts', name: 'main' },
        callee: { fileId: 'src/service.ts', name: 'service' },
        callSite: callRange('src/main.ts', 6, 24, 'renamedService()'),
        confidence: 'exact',
      },
    ],
  );
});

test('resolves a directly owned internal static method from a function caller deterministically', (context) => {
  const projectPath = createTempProject(context);
  writeProjectFile(projectPath, 'tsconfig.json', JSON.stringify({ compilerOptions: { strict: true }, include: ['src/**/*.ts'] }));
  writeProjectFile(projectPath, 'src/main.ts', [
    'class Service {',
    '  static execute(): string {',
    "    return 'ok';",
    '  }',
    '}',
    '',
    'export function main(): string {',
    '  return Service.execute();',
    '}',
    '',
    "class Other { static execute(): string { return 'other'; } }",
    '',
  ].join('\n'));

  const session = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);
  const first = extractExactInternalInvocationRelations(session);
  const freshSession = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);

  assert.deepEqual(first, extractExactInternalInvocationRelations(session));
  assert.deepEqual(first, extractExactInternalInvocationRelations(freshSession));
  assert.deepEqual(invocationSummary(first), [{
    caller: { id: 'experimental-invocation:function:src/main.ts:69', fileId: 'src/main.ts', name: 'main', kind: undefined },
    callee: { id: 'experimental-invocation:static-method:src/main.ts:18', kind: 'static-method', fileId: 'src/main.ts', name: 'execute' },
    callSite: callRange('src/main.ts', 8, 10, 'Service.execute()'),
    confidence: 'exact',
  }]);
  assert.deepEqual(first.unclassifiedCalls, []);
});

test('preserves unsupported and external method calls without exact relations', (context) => {
  const projectPath = createTempProject(context);
  writeProjectFile(projectPath, 'tsconfig.json', JSON.stringify({
    compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler' },
    include: ['src/**/*.ts'],
  }));
  writeProjectFile(projectPath, 'node_modules/fixture-external/package.json', JSON.stringify({ types: 'index.d.ts' }));
  writeProjectFile(projectPath, 'node_modules/fixture-external/index.d.ts', 'export declare class Service { static execute(): string; }\n');
  const cases = [
    { file: 'computed', declaration: "class Service { static execute() { return 'ok'; } }", parameters: '', call: 'Service["execute"]()', reason: 'unsupported-call-form' },
    { file: 'external', declaration: "import { Service } from 'fixture-external';", parameters: '', call: 'Service.execute()', reason: 'target-outside-analyzed-files' },
    { file: 'inherited', declaration: "class Base { static execute() { return 'ok'; } } class Service extends Base {}", parameters: '', call: 'Service.execute()', reason: 'unsupported-call-form' },
    { file: 'instance', declaration: "class Service { execute() { return 'ok'; } }", parameters: 'service: Service', call: 'service.execute()', reason: 'unsupported-call-form' },
    { file: 'interface', declaration: 'interface Service { execute(): string; }', parameters: 'service: Service', call: 'service.execute()', reason: 'unsupported-call-form' },
    { file: 'optional-call', declaration: "class Service { static execute() { return 'ok'; } }", parameters: '', call: 'Service.execute?.()', reason: 'unsupported-call-form' },
    { file: 'optional-receiver', declaration: "class Service { static execute() { return 'ok'; } }", parameters: '', call: 'Service?.execute()', reason: 'unsupported-call-form' },
    { file: 'overload', declaration: "class Service { static execute(): string; static execute(value: string): string; static execute(value?: string): string { return value ?? 'ok'; } }", parameters: '', call: 'Service.execute()', reason: 'multiple-target-declarations' },
    { file: 'property', declaration: "class Service { static execute = () => 'ok'; }", parameters: '', call: 'Service.execute()', reason: 'unsupported-call-form' },
    { file: 'unresolved', declaration: 'class Service {}', parameters: '', call: 'Service.execute()', reason: 'unresolved-target' },
  ];
  for (const scenario of cases) {
    writeProjectFile(projectPath, `src/${scenario.file}.ts`, [
      scenario.declaration,
      `export function main(${scenario.parameters}) {`,
      `  return ${scenario.call};`,
      '}',
      '',
    ].join('\n'));
  }
  const session = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);
  const first = extractExactInternalInvocationRelations(session);
  const reordered = { ...session, sourceFiles: new Map([...session.sourceFiles].reverse()) };

  assert.deepEqual(first, extractExactInternalInvocationRelations(reordered));
  assert.deepEqual(first, {
    exactRelations: [],
    unclassifiedCalls: cases.map(({ file, reason, call }) => ({
      callSite: callRange(`src/${file}.ts`, 3, 10, call),
      reason,
    })),
  });
});

test('does not attribute a nested constructor call to its enclosing function', (context) => {
  const projectPath = createTempProject(context);
  writeProjectFile(projectPath, 'tsconfig.json', JSON.stringify({ include: ['src/**/*.ts'] }));
  writeProjectFile(projectPath, 'src/main.ts', [
    "class Service { static execute() { return 'ok'; } }",
    'export function main() {',
    '  class Nested {',
    '    constructor() {',
    '      Service.execute();',
    '    }',
    '  }',
    '}',
  ].join('\n'));
  const session = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);

  assert.deepEqual(extractExactInternalInvocationRelations(session), {
    exactRelations: [],
    unclassifiedCalls: [{
      callSite: callRange('src/main.ts', 5, 7, 'Service.execute()'),
      reason: 'unsupported-call-form',
    }],
  });
});

test('does not classify overloaded imported functions as exact invocations', (context) => {
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true }, include: ['src/**/*.ts'] }),
  );
  writeProjectFile(projectPath, 'src/main.ts', "import { service } from './service';\nexport function main(): string { return service('ok'); }\n");
  writeProjectFile(projectPath, 'src/service.ts', "export function service(value: string): string;\nexport function service(value: number): string;\nexport function service(value: string | number): string { return value as string; }\n");

  const session = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);

  assert.deepEqual(extractExactInternalInvocationRelations(session), {
    exactRelations: [],
    unclassifiedCalls: [
      {
        callSite: callRange('src/main.ts', 2, 41, "service('ok')"),
        reason: 'multiple-target-declarations',
      },
    ],
  });
});

test('preserves external calls as unclassified without inferring an internal target', (context) => {
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true }, include: ['src/**/*.ts'] }),
  );
  writeProjectFile(projectPath, 'src/main.ts', "import { external } from 'fixture-external';\nexport function main(): void { external(); }\n");
  writeProjectFile(projectPath, 'node_modules/fixture-external/package.json', JSON.stringify({ types: 'index.d.ts' }));
  writeProjectFile(projectPath, 'node_modules/fixture-external/index.d.ts', 'export declare function external(): void;\n');

  const session = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);
  const first = extractExactInternalInvocationRelations(session);
  const second = extractExactInternalInvocationRelations(session);

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    exactRelations: [],
    unclassifiedCalls: [
      {
        callSite: callRange('src/main.ts', 2, 32, 'external()'),
        reason: 'target-outside-analyzed-files',
      },
    ],
  });
});

test('uses source ranges as deterministic local addresses for declarations and call expressions', (context) => {
  const projectPath = createTempProject(context);
  writeProjectFile(projectPath, 'tsconfig.json', JSON.stringify({
    compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler' },
    include: ['src/**/*.ts'],
  }));
  writeProjectFile(projectPath, 'src/service.ts', "export function service(): string { return 'service'; }\n");
  writeProjectFile(projectPath, 'src/main.ts', [
    "import { service as alias } from './service';",
    '',
    "function alpha(): string { return 'alpha'; }",
    "function beta(): string { return 'beta'; }",
    'class First { static execute(): string { return \'first\'; } }',
    'class Second { static execute(): string { return \'second\'; } }',
    "function factory(): () => string { return () => 'factory'; }",
    '',
    'export function main(): string {',
    '  alias();',
    '  alias();',
    '  First.execute();',
    '  Second.execute();',
    '  factory()();',
    '  return alpha() + beta();',
    '}',
    '',
  ].join('\n'));

  const tsconfigPath = path.join(projectPath, 'tsconfig.json');
  const session = createTypeScriptAnalysisSession(projectPath, [tsconfigPath], () => true);
  const freshSession = createTypeScriptAnalysisSession(projectPath, [tsconfigPath], () => true);
  const first = extractExactInternalInvocationRelations(session);

  assert.deepEqual(first, extractExactInternalInvocationRelations(session));
  assert.deepEqual(first, extractExactInternalInvocationRelations(freshSession));
  assert.equal(first.exactRelations.length, 7);
  assert.equal(first.unclassifiedCalls.length, 1);

  const callRanges = [
    ...first.exactRelations.map((relation) => relation.callSite),
    ...first.unclassifiedCalls.map((call) => call.callSite),
  ];
  assert.equal(new Set(callRanges.map((range) => JSON.stringify(range))).size, callRanges.length);

  const callNodes = [...session.sourceFiles.values()].flatMap((sourceFile) => (
    sourceFile.getDescendants()
      .filter((node) => node.getKindName() === 'CallExpression')
      .map((call) => astRange(session.locationFor(sourceFile).filePath, call))
  ));
  assert.deepEqual(
    callRanges.map((range) => JSON.stringify(range)).sort(),
    callNodes.map((range) => JSON.stringify(range)).sort(),
  );

  const declarationNodes = [...session.sourceFiles.values()].flatMap((sourceFile) => (
    sourceFile.getDescendants()
      .filter((node) => node.getKindName() === 'FunctionDeclaration' || node.getKindName() === 'MethodDeclaration')
      .map((declaration) => astRange(session.locationFor(sourceFile).filePath, declaration))
  ));
  for (const relation of first.exactRelations) {
    assert.ok(declarationNodes.some((range) => JSON.stringify(range) === JSON.stringify(relation.caller.declaration)));
    assert.ok(declarationNodes.some((range) => JSON.stringify(range) === JSON.stringify(relation.callee.declaration)));
  }

  const nestedCalls = callRanges.filter((range) => range.start.line === 14 && range.start.column === 3);
  assert.equal(nestedCalls.length, 2);
  assert.notDeepEqual(nestedCalls[0]?.end, nestedCalls[1]?.end);

  const aliasRelations = first.exactRelations.filter((relation) => relation.callee.name === 'service');
  assert.equal(aliasRelations.length, 2);
  assert.deepEqual(aliasRelations[0]?.callee.declaration, aliasRelations[1]?.callee.declaration);
  assert.notDeepEqual(aliasRelations[0]?.callSite, aliasRelations[1]?.callSite);

  const staticMethods = first.exactRelations
    .filter((relation) => relation.callee.kind === 'static-method' && relation.callee.name === 'execute')
    .map((relation) => relation.callee.declaration);
  assert.equal(staticMethods.length, 2);
  assert.notDeepEqual(staticMethods[0], staticMethods[1]);

  const localFunctions = first.exactRelations
    .filter((relation) => relation.callee.fileId === 'src/main.ts' && ['alpha', 'beta'].includes(relation.callee.name))
    .map((relation) => relation.callee.declaration);
  assert.equal(localFunctions.length, 2);
  assert.notDeepEqual(localFunctions[0], localFunctions[1]);
});

test('preserves every optional call form as unclassified before symbol resolution', (context) => {
  const projectPath = createTempProject(context);
  writeProjectFile(projectPath, 'tsconfig.json', JSON.stringify({ include: ['src/**/*.ts'] }));
  writeProjectFile(projectPath, 'src/main.ts', [
    'function fn(): void {}',
    'class Service { static execute(): void {} }',
    'export function main(): void {',
    '  fn?.();',
    '  Service?.execute();',
    '  Service.execute?.();',
    '}',
  ].join('\n'));

  const session = createTypeScriptAnalysisSession(projectPath, [path.join(projectPath, 'tsconfig.json')], () => true);

  assert.deepEqual(extractExactInternalInvocationRelations(session), {
    exactRelations: [],
    unclassifiedCalls: [
      { callSite: callRange('src/main.ts', 4, 3, 'fn?.()'), reason: 'unsupported-call-form' },
      { callSite: callRange('src/main.ts', 5, 3, 'Service?.execute()'), reason: 'unsupported-call-form' },
      { callSite: callRange('src/main.ts', 6, 3, 'Service.execute?.()'), reason: 'unsupported-call-form' },
    ],
  });
});

test('uses the last TypeScript context for an overlapping source path', (context) => {
  const projectPath = createTempProject(context);
  writeProjectFile(projectPath, 'src/main.ts', [
    "import { service } from '@service';",
    'export function main(): string { return service(); }',
  ].join('\n'));
  writeProjectFile(projectPath, 'targets/a.ts', "export function service(): string { return 'a'; }\n");
  writeProjectFile(projectPath, 'targets/b.ts', "export function service(): string { return 'b'; }\n");
  writeProjectFile(projectPath, 'configs/a.json', JSON.stringify({
    compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '..', paths: { '@service': ['targets/a.ts'] } },
    files: ['../src/main.ts', '../targets/a.ts'],
  }));
  writeProjectFile(projectPath, 'configs/b.json', JSON.stringify({
    compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '..', paths: { '@service': ['targets/b.ts'] } },
    files: ['../src/main.ts', '../targets/b.ts'],
  }));

  const a = path.join(projectPath, 'configs/a.json');
  const b = path.join(projectPath, 'configs/b.json');
  const forward = createTypeScriptAnalysisSession(projectPath, [a, b], () => true);
  const reverse = createTypeScriptAnalysisSession(projectPath, [b, a], () => true);
  const forwardResult = extractExactInternalInvocationRelations(forward);
  const reverseResult = extractExactInternalInvocationRelations(reverse);

  assert.deepEqual(forwardResult, extractExactInternalInvocationRelations(
    createTypeScriptAnalysisSession(projectPath, [a, b], () => true),
  ));
  assert.equal(forward.sourceFiles.get('src/main.ts')?.getFilePath(), reverse.sourceFiles.get('src/main.ts')?.getFilePath());
  assert.equal(forwardResult.exactRelations[0]?.callee.fileId, 'targets/b.ts');
  assert.equal(reverseResult.exactRelations[0]?.callee.fileId, 'targets/a.ts');
  assert.notDeepEqual(forwardResult, reverseResult);
});

test('classifies only analyzed source files as internal dependencies', (context) => {
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        baseUrl: '.',
        paths: {
          '@internal/*': ['src/internal/*'],
        },
        strict: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  writeProjectFile(
    projectPath,
    'src/main.ts',
    [
      "import { local } from './local';",
      "import { aliased } from '@internal/aliased';",
      "import { external } from 'fixture-external';",
      "import { createHash } from 'node:crypto';",
      '',
      "export const value = `${local}${aliased}${external}${createHash('sha256').digest('hex')}`;",
      '',
    ].join('\n'),
  );
  writeProjectFile(projectPath, 'src/local.ts', "export const local = 'local';\n");
  writeProjectFile(projectPath, 'src/internal/aliased.ts', "export const aliased = 'aliased';\n");
  writeProjectFile(
    projectPath,
    'node_modules/fixture-external/package.json',
    JSON.stringify({ types: 'index.d.ts' }),
  );
  writeProjectFile(projectPath, 'node_modules/fixture-external/index.d.ts', "export declare const external: 'external';\n");

  const analysis = analyzeProject(projectPath);
  const graph = buildProjectGraph(analysis);
  const diagnostics = createProjectDiagnostics(graph);
  const dependencyBySpecifier = new Map(analysis.dependencies.map((dependency) => [dependency.moduleSpecifier, dependency]));

  assert.deepEqual(dependencyBySpecifier.get('./local'), {
    sourceFileId: 'src/main.ts',
    targetFileId: 'src/local.ts',
    moduleSpecifier: './local',
    kind: 'internal',
    evidence: {
      location: { filePath: 'src/main.ts', line: 1, column: 23 },
    },
    confidence: 'exact',
  });
  assert.deepEqual(dependencyBySpecifier.get('@internal/aliased'), {
    sourceFileId: 'src/main.ts',
    targetFileId: 'src/internal/aliased.ts',
    moduleSpecifier: '@internal/aliased',
    kind: 'internal',
    evidence: {
      location: { filePath: 'src/main.ts', line: 2, column: 25 },
    },
    confidence: 'exact',
  });

  for (const moduleSpecifier of ['fixture-external', 'node:crypto']) {
    const dependency = dependencyBySpecifier.get(moduleSpecifier);
    const edge = graph.edges.find((candidate) => candidate.moduleSpecifier === moduleSpecifier);

    assert.ok(dependency);
    assert.equal(dependency.kind, 'external');
    assert.equal(dependency.targetFileId, undefined);
    assert.ok(edge);
    assert.equal(edge.dependencyKind, 'external');
    assert.equal(graph.nodes.find((node) => node.id === edge.targetNodeId)?.kind, 'external');
  }

  assert.equal(
    diagnostics.diagnostics.some((diagnostic) => diagnostic.kind === 'many-dependencies' && diagnostic.subject.nodeId === 'src/main.ts'),
    false,
  );
});

test('distinguishes external and unresolved dependencies', (context) => {
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  writeProjectFile(
    projectPath,
    'src/main.ts',
    [
      "import { externalValue } from 'external-package';",
      "import { missingValue } from './missing';",
      '',
      'export const value = externalValue ?? missingValue;',
      '',
    ].join('\n'),
  );

  const result = analyzeProject(projectPath);

  assert.deepEqual(result.files, [{ id: 'src/main.ts', path: 'src/main.ts' }]);
  assert.deepEqual(result.dependencies, [
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: 'external-package',
      kind: 'external',
      evidence: {
        location: {
          filePath: 'src/main.ts',
          line: 1,
          column: 31,
        },
      },
      confidence: 'inferred',
    },
  ]);
  assert.deepEqual(result.unresolvedDependencies, [
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: './missing',
      reason: 'relative-target-not-found',
      evidence: {
        location: {
          filePath: 'src/main.ts',
          line: 2,
          column: 30,
        },
      },
      confidence: 'exact',
    },
  ]);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, 'unresolved-dependency');
  assert.equal(result.diagnostics[0]?.severity, 'warning');
});

test('resolves realistic TypeScript module patterns deterministically', (context) => {
  const projectPath = createTempProject(context);

  writeProjectFile(
    projectPath,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        baseUrl: 'src',
        paths: {
          '@exact': ['exact.ts'],
          '@broken-exact': ['missing-exact.ts'],
          '@core/*': ['core/*'],
        },
        strict: true,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/excluded.ts'],
    }),
  );
  writeProjectFile(
    projectPath,
    'src/main.ts',
    [
      "import { helper } from './utils/helper';",
      "import { nested } from './nested/nested';",
      "import { core } from '@core/core';",
      "import { exact } from '@exact';",
      "import { feature } from 'feature/index';",
      "import { barrel } from './barrel';",
      "import type { TypeOnly } from './types';",
      "import 'external-package';",
      "import './missing';",
      "import '@broken-exact';",
      "import '@core/missing';",
      '',
      'export const value: TypeOnly = `${helper()}${nested()}${core()}${exact()}${feature()}${barrel}`;',
      '',
    ].join('\n'),
  );
  writeProjectFile(projectPath, 'src/utils/helper.ts', "export function helper(): string { return 'helper'; }\n");
  writeProjectFile(projectPath, 'src/nested/nested.ts', "export function nested(): string { return 'nested'; }\n");
  writeProjectFile(projectPath, 'src/core/core.ts', "export function core(): string { return 'core'; }\n");
  writeProjectFile(projectPath, 'src/exact.ts', "export function exact(): string { return 'exact'; }\n");
  writeProjectFile(projectPath, 'src/feature/index.ts', "export { feature } from './feature-service';\n");
  writeProjectFile(projectPath, 'src/feature/feature-service.ts', "export function feature(): string { return 'feature'; }\n");
  writeProjectFile(projectPath, 'src/barrel/index.ts', "export * from './target';\n");
  writeProjectFile(projectPath, 'src/barrel/target.ts', "export const barrel = 'barrel';\n");
  writeProjectFile(projectPath, 'src/reexport.ts', "export { nested } from './nested/nested';\n");
  writeProjectFile(projectPath, 'src/types.ts', 'export interface TypeOnly { toString(): string; }\n');
  writeProjectFile(projectPath, 'src/excluded.ts', "import './not-analyzed';\n");

  const first = analyzeProject(projectPath);
  const second = analyzeProject(projectPath);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.files.map((file) => file.path),
    [
      'src/barrel/index.ts',
      'src/barrel/target.ts',
      'src/core/core.ts',
      'src/exact.ts',
      'src/feature/feature-service.ts',
      'src/feature/index.ts',
      'src/main.ts',
      'src/nested/nested.ts',
      'src/reexport.ts',
      'src/types.ts',
      'src/utils/helper.ts',
    ],
  );
  assert.deepEqual(dependencySummary(first), [
    {
      sourceFileId: 'src/barrel/index.ts',
      targetFileId: 'src/barrel/target.ts',
      moduleSpecifier: './target',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/feature/index.ts',
      targetFileId: 'src/feature/feature-service.ts',
      moduleSpecifier: './feature-service',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/barrel/index.ts',
      moduleSpecifier: './barrel',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/nested/nested.ts',
      moduleSpecifier: './nested/nested',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/types.ts',
      moduleSpecifier: './types',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/utils/helper.ts',
      moduleSpecifier: './utils/helper',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/core/core.ts',
      moduleSpecifier: '@core/core',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/exact.ts',
      moduleSpecifier: '@exact',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: 'external-package',
      kind: 'external',
      confidence: 'inferred',
    },
    {
      sourceFileId: 'src/main.ts',
      targetFileId: 'src/feature/index.ts',
      moduleSpecifier: 'feature/index',
      kind: 'internal',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/reexport.ts',
      targetFileId: 'src/nested/nested.ts',
      moduleSpecifier: './nested/nested',
      kind: 'internal',
      confidence: 'exact',
    },
  ]);
  assert.deepEqual(first.unresolvedDependencies.map(({ sourceFileId, moduleSpecifier, reason, confidence }) => ({
    sourceFileId,
    moduleSpecifier,
    reason,
    confidence,
  })), [
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: './missing',
      reason: 'relative-target-not-found',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: '@broken-exact',
      reason: 'configured-internal-target-not-found',
      confidence: 'exact',
    },
    {
      sourceFileId: 'src/main.ts',
      moduleSpecifier: '@core/missing',
      reason: 'configured-internal-target-not-found',
      confidence: 'exact',
    },
  ]);
  assert.equal(first.diagnostics.length, 3);
  assert.equal(first.diagnostics[0]?.code, 'unresolved-dependency');
  assert.equal(first.dependencies.every((dependency) => dependency.evidence.location.filePath.includes('\\') === false), true);
  assert.equal(first.unresolvedDependencies.every((dependency) => dependency.evidence.location.filePath.includes('\\') === false), true);
});

test('reports invalid project inputs explicitly', (context) => {
  const missingProjectPath = path.join(os.tmpdir(), 'bunkercode-missing-project');
  const withoutTsconfigPath = createTempProject(context);
  const invalidTsconfigPath = createTempProject(context);

  writeProjectFile(invalidTsconfigPath, 'tsconfig.json', '{ invalid json');

  assert.throws(
    () => analyzeProject(missingProjectPath),
    /Project directory not found:/,
  );
  assert.throws(
    () => analyzeProject(withoutTsconfigPath),
    /tsconfig\.json not found:/,
  );
  assert.throws(
    () => analyzeProject(invalidTsconfigPath),
    /Invalid TypeScript project configuration:/,
  );
});
