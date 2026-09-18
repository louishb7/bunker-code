import {
  ANALYSIS_SCHEMA_VERSION,
  RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION,
  type AnalysisResult,
  type DetectorExecution,
  type ObservedResponsibilityClaim,
  type ObservedResponsibilityContext,
  type ObservedResponsibilityUnit,
  type Responsibility,
  type ResponsibilityAnalysisResult,
  type ResponsibilityCoverage,
  type ResponsibilityEvaluationScope,
} from '@bunker-code/contracts';
import { deriveObservedResponsibilityClaims, deriveObservedResponsibilityFileParts } from './observed-responsibility-model.js';

function sameScope(left: ResponsibilityEvaluationScope, right: ResponsibilityEvaluationScope): boolean {
  if (left.kind === 'project') return right.kind === 'project';
  if (left.kind === 'file') return right.kind === 'file' && left.fileId === right.fileId;
  return right.kind === 'subject' && left.fileId === right.fileId && left.subjectId === right.subjectId;
}

export function resolveObservedResponsibilityFile(unit: ObservedResponsibilityUnit, fileId: string) {
  const file = unit.sources.analysis.files.find((item) => item.id === fileId);
  if (!file) throw new Error(`Missing analyzed file: ${fileId}`);
  return file;
}

export function resolveObservedResponsibilitySupports(unit: ObservedResponsibilityUnit, claim: ObservedResponsibilityClaim) {
  return claim.supports.map(({ findingId }) => {
    const finding = unit.sources.responsibilities.findings.find((item) => item.id === findingId);
    if (!finding) throw new Error(`Missing responsibility finding: ${findingId}`);
    if (finding.subject.id !== claim.subject.subjectId || finding.subject.kind !== claim.subject.kind ||
      finding.subject.fileId !== claim.subject.fileId || finding.responsibility !== claim.responsibility) {
      throw new Error(`Inconsistent Claim support: ${findingId}`);
    }
    return finding;
  });
}

export function findObservedResponsibilityCoverage(
  unit: ObservedResponsibilityUnit, capability: Responsibility, scope: ResponsibilityEvaluationScope,
) {
  return unit.sources.responsibilities.coverage.find((item) => item.capability === capability && sameScope(item.scope, scope));
}

export function findObservedResponsibilityExecutions(
  unit: ObservedResponsibilityUnit, capability: Responsibility, scope: ResponsibilityEvaluationScope,
) {
  return unit.sources.responsibilities.detectorExecutions.filter((item) => item.capability === capability && sameScope(item.scope, scope));
}

export function resolveObservedResponsibilityLimitations(
  unit: ObservedResponsibilityUnit, evaluation: ResponsibilityCoverage | DetectorExecution,
) {
  return ('limitationIds' in evaluation ? evaluation.limitationIds : []).map((id) => {
    const limitation = unit.sources.responsibilities.limitations.find((item) => item.id === id);
    if (!limitation) throw new Error(`Missing responsibility limitation: ${id}`);
    return limitation;
  });
}

/**
 * The caller asserts that both sources belong to the same production. Matching
 * metadata and valid references cannot prove that assertion for arbitrary JSON.
 * Sources are retained, not cloned or frozen; callers must not edit a built unit
 * or its sources. Rebuild the derived view after producing new source data.
 */
export function createObservedResponsibilityUnit(
  analysis: AnalysisResult,
  responsibilities: ResponsibilityAnalysisResult,
  context: ObservedResponsibilityContext,
): ObservedResponsibilityUnit {
  if (analysis.schemaVersion !== ANALYSIS_SCHEMA_VERSION) throw new Error('Unsupported analysis schema version.');
  if (responsibilities.schemaVersion !== RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION) throw new Error('Unsupported responsibility schema version.');
  if (context.profile !== 'static-responsibility' || context.nature !== 'derived-from-static-analysis' ||
    context.implementationState !== 'loaded-production' || !context.representedTarget.trim()) {
    throw new Error('Invalid observed Responsibility context.');
  }
  if (analysis.projectPath !== responsibilities.projectPath || analysis.analyzer.name !== responsibilities.analyzer.name ||
    analysis.analyzer.language !== responsibilities.analyzer.language) {
    throw new Error('Inconsistent observed Responsibility source metadata.');
  }

  const parts = deriveObservedResponsibilityFileParts(analysis);
  const claims = deriveObservedResponsibilityClaims(responsibilities.findings, parts);
  const unit: ObservedResponsibilityUnit = {
    schemaVersion: 1,
    context: { ...context },
    sources: { analysis, responsibilities },
    model: { parts, claims },
  };
  const executions = new Set<string>();
  const limitations = new Set<string>();
  const files = new Map(analysis.files.map((file) => [file.id, file]));
  const findings = new Map(responsibilities.findings.map((finding) => [finding.id, finding]));
  for (const record of [...responsibilities.coverage, ...responsibilities.detectorExecutions, ...responsibilities.limitations]) {
    if (record.scope.kind !== 'project' && !files.has(record.scope.fileId)) {
      throw new Error(`Responsibility scope references missing file: ${record.scope.fileId}`);
    }
  }
  for (const finding of responsibilities.findings) {
    if (files.get(finding.subject.fileId)?.path !== finding.subject.location.filePath) {
      throw new Error(`Inconsistent responsibility subject location: ${finding.subject.id}`);
    }
  }
  for (const limitation of responsibilities.limitations) {
    if (limitations.has(limitation.id)) throw new Error(`Duplicate responsibility limitation ID: ${limitation.id}`);
    limitations.add(limitation.id);
  }
  for (const execution of responsibilities.detectorExecutions) {
    if (executions.has(execution.id)) throw new Error(`Duplicate detector execution ID: ${execution.id}`);
    executions.add(execution.id);
    for (const id of 'findingIds' in execution ? execution.findingIds : []) {
      const finding = findings.get(id);
      if (!finding) throw new Error(`Missing execution finding: ${id}`);
      if (finding.responsibility !== execution.capability || finding.provenance.detector.id !== execution.detector.id ||
        finding.provenance.detector.version !== execution.detector.version ||
        (execution.scope.kind !== 'project' && execution.scope.fileId !== finding.subject.fileId) ||
        (execution.scope.kind === 'subject' && execution.scope.subjectId !== finding.subject.id)) {
        throw new Error(`Inconsistent execution finding: ${id}`);
      }
    }
    resolveObservedResponsibilityLimitations(unit, execution);
  }
  const coverageScopes: ResponsibilityCoverage[] = [];
  for (const coverage of responsibilities.coverage) {
    if (coverageScopes.some((item) => item.capability === coverage.capability && sameScope(item.scope, coverage.scope))) {
      throw new Error(`Duplicate responsibility coverage scope: ${coverage.capability}`);
    }
    coverageScopes.push(coverage);
    resolveObservedResponsibilityLimitations(unit, coverage);
  }
  return unit;
}
