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
import { detectorExecutionId } from './identities.js';
import type { DetectorOutcome, ResponsibilityDetector } from './detector.js';

const ANALYZER = { name: '@bunker-code/analyzer-typescript', language: 'typescript' };

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function executionFor(detector: ResponsibilityDetector, outcome: DetectorOutcome): DetectorExecution {
  const id = detectorExecutionId(detector.detector.id, detector.detector.version, detector.capability);
  const findingIds = outcome.findings.map((finding) => finding.id).sort();
  const limitationIds = outcome.limitations.map((limitation) => limitation.id).sort();
  const shared = { id, detector: detector.detector, capability: detector.capability, scope: { kind: 'project' as const } };

  switch (outcome.status) {
    case 'evaluated': return { ...shared, status: 'evaluated', findingIds, limitationIds };
    case 'partially-evaluated': {
      if (limitationIds.length === 0) throw new Error(`Partially evaluated detector must report a limitation: ${detector.detector.id}`);
      return { ...shared, status: 'partially-evaluated', findingIds, limitationIds: limitationIds as [string, ...string[]] };
    }
    case 'failed': return { ...shared, status: 'failed', findingIds, limitationIds, failure: outcome.failure };
    case 'not-evaluated': return { ...shared, status: 'not-evaluated' };
    case 'not-applicable': return { ...shared, status: 'not-applicable' };
  }
}

function coverageFor(capability: ResponsibilityCoverage['capability'], executions: readonly DetectorExecution[]): ResponsibilityCoverage {
  const applicable = executions.filter((execution) => execution.status !== 'not-applicable');
  const scope = { kind: 'project' as const };

  if (applicable.length === 0) return { capability, scope, status: 'unsupported' };
  const failed = applicable.find((execution) => execution.status === 'failed');
  if (failed?.status === 'failed') return { capability, scope, status: 'failed', failure: failed.failure, limitationIds: failed.limitationIds };
  const partialIds = applicable.flatMap((execution) => execution.status === 'partially-evaluated' ? execution.limitationIds : []).sort();
  if (partialIds.length > 0) return { capability, scope, status: 'partially-evaluated', limitationIds: partialIds as [string, ...string[]] };
  if (applicable.some((execution) => execution.status === 'evaluated')) return { capability, scope, status: 'evaluated', limitationIds: [] };
  return { capability, scope, status: 'not-evaluated' };
}

export function analyzeResponsibilitiesWithSession(
  session: TypeScriptAnalysisSession,
  detectors: readonly ResponsibilityDetector[],
): ResponsibilityAnalysisResult {
  const detectorOutcomes = [...detectors]
    .sort((left, right) => left.capability.localeCompare(right.capability) || left.detector.id.localeCompare(right.detector.id) || left.detector.version.localeCompare(right.detector.version))
    .map((detector) => ({ detector, outcome: detector.analyze(session) }));
  const detectorExecutions = detectorOutcomes.map(({ detector, outcome }) => executionFor(detector, outcome)).sort(compareById);
  const findings = detectorOutcomes.flatMap(({ outcome }) => outcome.findings).sort(compareById);
  const limitations = detectorOutcomes.flatMap(({ outcome }) => outcome.limitations).sort(compareById);
  const coverage = RESPONSIBILITY_TAXONOMY
    .map(({ responsibility }) => coverageFor(responsibility, detectorExecutions.filter((execution) => execution.capability === responsibility)))
    .sort((left, right) => left.capability.localeCompare(right.capability));

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

export const responsibilityDetectors: readonly ResponsibilityDetector[] = [];
