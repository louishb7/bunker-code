import {
  RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION,
  RESPONSIBILITY_TAXONOMY,
  type DetectorExecution,
  type ResponsibilityAnalysisResult,
  type ResponsibilityCoverage,
  type ResponsibilityFinding,
  type ResponsibilityLimitation,
} from '@bunker-code/contracts';
import type { TypeScriptAnalysisSession } from '../typescript-analysis-session.js';
import { detectorExecutionId, responsibilityLimitationId } from './identities.js';
import type { DetectorOutcome, ResponsibilityDetector } from './detector.js';
import { nestjsAccessDetector, nestjsHttpDetector, nestjsWiringDetector } from './nestjs.js';

const ANALYZER = { name: '@bunker-code/analyzer-typescript', language: 'typescript' };

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function executionFor(detector: ResponsibilityDetector, outcome: DetectorOutcome): DetectorExecution {
  const id = detectorExecutionId(detector.detector.id, detector.detector.version, detector.capability, 'project');
  const findingIds = outcome.findings.map((finding) => finding.id).sort();
  const limitationIds = outcome.limitations.map((limitation) => limitation.id).sort();
  const shared = { id, detector: detector.detector, capability: detector.capability, scope: { kind: 'project' as const } };

  switch (outcome.status) {
    case 'evaluated': return { ...shared, status: 'evaluated', findingIds, limitationIds: [] };
    case 'partially-evaluated': {
      if (limitationIds.length === 0) throw new Error(`Partially evaluated detector must report a limitation: ${detector.detector.id}`);
      return { ...shared, status: 'partially-evaluated', findingIds, limitationIds: limitationIds as [string, ...string[]] };
    }
    case 'failed': return { ...shared, status: 'failed', findingIds, limitationIds, failure: outcome.failure };
    case 'not-evaluated': return { ...shared, status: 'not-evaluated' };
    case 'not-applicable': return { ...shared, status: 'not-applicable' };
  }
}

function coverageFor(capability: ResponsibilityCoverage['capability'], executions: readonly DetectorExecution[]): { coverage: ResponsibilityCoverage; limitations: ResponsibilityLimitation[] } {
  const applicable = executions.filter((execution) => execution.status !== 'not-applicable');
  const scope = { kind: 'project' as const };

  if (applicable.length === 0) return { coverage: { capability, scope, status: 'unsupported' }, limitations: [] };
  const failed = applicable.filter((execution): execution is Extract<DetectorExecution, { status: 'failed' }> => execution.status === 'failed');
  const valid = applicable.filter((execution) => execution.status === 'evaluated' || execution.status === 'partially-evaluated');
  if (valid.length === 0 && failed.length > 0) {
    const first = failed[0]!;
    const limitations = failed.map((execution) => ({
      id: responsibilityLimitationId(`project:${capability}`, 'detector-failed', execution.detector.id, execution.detector.version),
      scope,
      code: 'detector-failed',
      message: `Detector ${execution.detector.id}@${execution.detector.version} failed: ${execution.failure.message}`,
    }));
    return { coverage: { capability, scope, status: 'failed', failure: first.failure, limitationIds: limitations.map((limitation) => limitation.id).sort() }, limitations };
  }
  const partialIds = applicable.flatMap((execution) => execution.status === 'partially-evaluated' ? execution.limitationIds : []).sort();
  const failureLimitations = failed.map((execution) => ({
    id: responsibilityLimitationId(`project:${capability}`, 'detector-failed', execution.detector.id, execution.detector.version),
    scope,
    code: 'detector-failed',
    message: `Detector ${execution.detector.id}@${execution.detector.version} failed: ${execution.failure.message}`,
  }));
  const limitationIds = [...partialIds, ...failureLimitations.map((limitation) => limitation.id)].sort();
  if (limitationIds.length > 0) return { coverage: { capability, scope, status: 'partially-evaluated', limitationIds: limitationIds as [string, ...string[]] }, limitations: failureLimitations };
  if (valid.length > 0) return { coverage: { capability, scope, status: 'evaluated', limitationIds: [] }, limitations: [] };
  return { coverage: { capability, scope, status: 'not-evaluated' }, limitations: [] };
}

export function analyzeResponsibilitiesWithSession(
  session: TypeScriptAnalysisSession,
  detectors: readonly ResponsibilityDetector[],
): ResponsibilityAnalysisResult {
  const detectorOutcomes = [...detectors]
    .sort((left, right) => left.capability.localeCompare(right.capability) || left.detector.id.localeCompare(right.detector.id) || left.detector.version.localeCompare(right.detector.version))
    .map((detector) => ({ detector, outcome: detector.analyze(session) }));
  const detectorExecutions = detectorOutcomes.map(({ detector, outcome }) => executionFor(detector, outcome)).sort(compareById);
  const findings = detectorOutcomes.flatMap(({ outcome }) => outcome.status === 'evaluated' || outcome.status === 'partially-evaluated' ? outcome.findings : []).sort(compareById);
  const detectorLimitations = detectorOutcomes.flatMap(({ outcome }) => outcome.status === 'partially-evaluated' ? outcome.limitations : []);
  const aggregatedCoverage = RESPONSIBILITY_TAXONOMY.map(({ responsibility }) => coverageFor(responsibility, detectorExecutions.filter((execution) => execution.capability === responsibility)));
  const limitations = [...detectorLimitations, ...aggregatedCoverage.flatMap((item) => item.limitations)].sort(compareById);
  const coverage = aggregatedCoverage.map((item) => item.coverage).sort((left, right) => left.capability.localeCompare(right.capability));

  return {
    schemaVersion: RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION,
    analyzer: ANALYZER,
    projectPath: '.',
    findings,
    coverage,
    detectorExecutions,
    limitations,
  };
}

export const responsibilityDetectors: readonly ResponsibilityDetector[] = [nestjsHttpDetector, nestjsAccessDetector, nestjsWiringDetector];
