import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION,
  RESPONSIBILITY_TAXONOMY,
  type DetectorExecution,
  type DetectorIdentity,
  type ResponsibilityAnalysisResult,
  type ResponsibilityConfidence,
  type ResponsibilityCoverage,
  type ResponsibilityFinding,
  type ResponsibilityLimitation,
  type ResponsibilityProvenance,
  type ResponsibilityTechnology,
} from '../packages/contracts/src/index.js';

test('keeps responsibility facts serializable, framework-neutral, and separate from coverage', () => {
  const detector: DetectorIdentity = { id: 'typescript.decorators', version: '1' };
  const findings: ResponsibilityFinding[] = [
    {
      id: 'responsibility-finding:users-list-http',
      subject: { id: 'symbol:src/http/users.ts:UsersController.list', kind: 'method', fileId: 'src/http/users.ts', symbolId: 'UsersController.list', name: 'list', location: { filePath: 'src/http/users.ts', line: 12, column: 3 } },
      responsibility: 'http-entry-point',
      confidence: 'exact',
      provenance: { detector, ruleId: 'http-route-decorator', ruleVersion: '1' },
      evidence: [{ id: 'responsibility-evidence:users-get', kind: 'annotation', technology: { id: 'nestjs', displayName: 'NestJS' }, signal: '@Get()', location: { filePath: 'src/http/users.ts', line: 12, column: 3 } }],
    },
    {
      id: 'responsibility-finding:users-list-access-control',
      subject: { id: 'symbol:src/http/users.ts:UsersController.list', kind: 'method', fileId: 'src/http/users.ts', symbolId: 'UsersController.list', name: 'list', location: { filePath: 'src/http/users.ts', line: 12, column: 3 } },
      responsibility: 'access-control',
      confidence: 'inferred',
      provenance: { detector, ruleId: 'access-control-decorator', ruleVersion: '1' },
      evidence: [{ id: 'responsibility-evidence:users-auth', kind: 'annotation', technology: { id: 'nestjs', displayName: 'NestJS' }, signal: '@UseGuards()', location: { filePath: 'src/http/users.ts', line: 11, column: 3 } }],
    },
  ];
  const limitations: ResponsibilityLimitation[] = [
    {
      id: 'responsibility-limitation:graphql-decorator-metadata',
      scope: { kind: 'file', fileId: 'src/graphql/users.ts' },
      code: 'syntax-not-supported',
      message: 'Decorator metadata was unavailable.',
    },
  ];
  const coverage: ResponsibilityCoverage[] = [
    { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'evaluated', limitationIds: [] },
    { capability: 'graphql-entry-point', scope: { kind: 'file', fileId: 'src/graphql/users.ts' }, status: 'partially-evaluated', limitationIds: ['responsibility-limitation:graphql-decorator-metadata'] },
    { capability: 'websocket-entry-point', scope: { kind: 'subject', subjectId: findings[0]!.subject.id, fileId: findings[0]!.subject.fileId }, status: 'not-evaluated' },
    { capability: 'rpc-entry-point', scope: { kind: 'project' }, status: 'unsupported' },
    { capability: 'access-control', scope: { kind: 'project' }, status: 'failed', failure: { code: 'parser-failure', message: 'The source could not be evaluated.' }, limitationIds: [] },
  ];
  const executions: DetectorExecution[] = [
    { id: 'detector-execution:typescript.decorators:http', detector, capability: 'http-entry-point', scope: { kind: 'project' }, status: 'not-applicable' },
    { id: 'detector-execution:typescript.routes:http', detector: { id: 'typescript.routes', version: '1' }, capability: 'http-entry-point', scope: { kind: 'project' }, status: 'evaluated', findingIds: ['responsibility-finding:users-list-http'], limitationIds: ['responsibility-limitation:graphql-decorator-metadata'] },
  ];
  const result: ResponsibilityAnalysisResult = {
    schemaVersion: RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION,
    analyzer: { name: 'bunker-code-typescript', language: 'typescript' },
    projectPath: '.',
    findings,
    coverage,
    detectorExecutions: executions,
    limitations,
  };

  assert.deepEqual(RESPONSIBILITY_TAXONOMY, [
    { family: 'interface', responsibility: 'http-entry-point' },
    { family: 'interface', responsibility: 'graphql-entry-point' },
    { family: 'interface', responsibility: 'websocket-entry-point' },
    { family: 'interface', responsibility: 'rpc-entry-point' },
    { family: 'security', responsibility: 'access-control' },
    { family: 'data', responsibility: 'persistence-interaction' },
    { family: 'data', responsibility: 'cache-interaction' },
    { family: 'integration', responsibility: 'external-service-interaction' },
    { family: 'async-processing', responsibility: 'queue-producer' },
    { family: 'async-processing', responsibility: 'queue-consumer' },
    { family: 'async-processing', responsibility: 'event-publisher' },
    { family: 'async-processing', responsibility: 'event-handler' },
    { family: 'async-processing', responsibility: 'scheduled-job' },
    { family: 'composition', responsibility: 'framework-wiring' },
  ]);
  assert.equal(findings[0]?.subject.fileId, 'src/http/users.ts');
  assert.equal(findings[0]?.id, 'responsibility-finding:users-list-http');
  assert.deepEqual(findings[0]?.evidence[0]?.technology, { id: 'nestjs', displayName: 'NestJS' });
  assert.equal(findings[0]?.evidence[0]?.signal, '@Get()');
  const evaluatedExecution = executions.find(
    (execution): execution is Extract<DetectorExecution, { status: 'evaluated' }> => execution.status === 'evaluated',
  );
  assert.equal(evaluatedExecution?.findingIds[0], findings[0]?.id);
  assert.equal(evaluatedExecution?.limitationIds[0], limitations[0]?.id);
  assert.equal(findings.some((finding) => 'primaryResponsibility' in finding), false);
  assert.doesNotMatch(JSON.stringify(RESPONSIBILITY_TAXONOMY), /nest|prisma/i);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

// @ts-expect-error Responsibility facts do not admit uncertain confidence.
const uncertainConfidence: ResponsibilityConfidence = 'uncertain';
void uncertainConfidence;

// @ts-expect-error Failed capability coverage requires a traceable cause.
const failedCoverageWithoutCause: ResponsibilityCoverage = { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'failed' };
void failedCoverageWithoutCause;

// @ts-expect-error Detector identity requires a reproducible version.
const detectorWithoutVersion: DetectorIdentity = { id: 'typescript.decorators' };
void detectorWithoutVersion;

// @ts-expect-error Rule provenance requires a reproducible version.
const provenanceWithoutRuleVersion: ResponsibilityProvenance = { detector: { id: 'typescript.decorators', version: '1' }, ruleId: 'route' };
void provenanceWithoutRuleVersion;

// @ts-expect-error Detector execution status cannot claim capability-level unsupported.
const unsupportedDetectorExecution: DetectorExecution = { id: 'detector-execution:unsupported', detector: { id: 'typescript.routes', version: '1' }, capability: 'http-entry-point', scope: { kind: 'project' }, status: 'unsupported' };
void unsupportedDetectorExecution;

// @ts-expect-error Partial coverage requires at least one structured limitation reference.
const partialCoverageWithoutLimitation: ResponsibilityCoverage = { capability: 'http-entry-point', scope: { kind: 'project' }, status: 'partially-evaluated' };
void partialCoverageWithoutLimitation;

const technology: ResponsibilityTechnology = { id: 'nestjs', displayName: 'NestJS' };
void technology;
