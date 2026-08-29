import { buildProjectGraph, buildProjectStructure } from '@bunker-code/graph-engine';
import type { AnalysisResult, ResponsibilityAnalysisResult } from '@bunker-code/contracts';
import type { ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';

export interface ExplorerSnapshot {
  analysis: AnalysisResult;
  responsibilities: ResponsibilityAnalysisResult;
  projectLabel?: string;
}

export type ExplorerRuntimeState =
  | { kind: 'loading' }
  | { kind: 'invalid-snapshot'; message: string }
  | { kind: 'empty-graph'; graph: ProjectGraph }
  | {
    kind: 'ready';
    graph: ProjectGraph;
    structure: ProjectStructure;
    responsibilities: ResponsibilityAnalysisResult;
    projectLabel: string;
  };

export function createExplorerRuntime(snapshot: unknown): ExplorerRuntimeState {
  const explorerSnapshot = readExplorerSnapshot(snapshot);

  if (!explorerSnapshot) {
    return {
      kind: 'invalid-snapshot',
      message: 'The generated snapshot is not a usable Explorer snapshot.',
    };
  }

  try {
    const graph = buildProjectGraph(explorerSnapshot.analysis);

    if (!graph.nodes.some((node) => node.kind === 'file')) {
      return { kind: 'empty-graph', graph };
    }

    const structure = buildProjectStructure(explorerSnapshot.analysis);
    return {
      kind: 'ready',
      graph,
      structure,
      responsibilities: explorerSnapshot.responsibilities,
      projectLabel: readProjectLabel(explorerSnapshot),
    };
  } catch (error) {
    return {
      kind: 'invalid-snapshot',
      message: error instanceof Error ? error.message : 'The generated snapshot could not be read.',
    };
  }
}

function readExplorerSnapshot(value: unknown): ExplorerSnapshot | null {
  return isExplorerSnapshot(value) ? value : null;
}

function isExplorerSnapshot(value: unknown): value is ExplorerSnapshot {
  return isRecord(value)
    && isAnalysisResult(value.analysis)
    && isResponsibilityAnalysisResult(value.responsibilities)
    && value.analysis.projectPath === value.responsibilities.projectPath
    && value.analysis.analyzer.language === value.responsibilities.analyzer.language
    && (value.projectLabel === undefined || typeof value.projectLabel === 'string');
}

function isResponsibilityAnalysisResult(value: unknown): value is ResponsibilityAnalysisResult {
  return isRecord(value)
    && value.schemaVersion === 1
    && isAnalyzerMetadata(value.analyzer)
    && typeof value.projectPath === 'string'
    && Array.isArray(value.findings) && value.findings.every(isResponsibilityFinding)
    && Array.isArray(value.coverage) && value.coverage.every(isCoverage)
    && Array.isArray(value.detectorExecutions) && value.detectorExecutions.every(isDetectorExecution)
    && Array.isArray(value.limitations) && value.limitations.every(isLimitation);
}

function isAnalyzerMetadata(value: unknown): boolean {
  return isRecord(value) && typeof value.name === 'string' && typeof value.language === 'string';
}

function isLocation(value: unknown): boolean {
  return isRecord(value) && typeof value.filePath === 'string' && Number.isInteger(value.line) && Number.isInteger(value.column);
}

function isScope(value: unknown): boolean {
  return isRecord(value) && ((value.kind === 'project') || (value.kind === 'file' && typeof value.fileId === 'string') || (value.kind === 'subject' && typeof value.subjectId === 'string' && typeof value.fileId === 'string'));
}

function isSubject(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.fileId !== 'string' || !isLocation(value.location)) return false;
  return value.kind === 'file' || ((value.kind === 'class' || value.kind === 'method' || value.kind === 'function') && typeof value.symbolId === 'string' && typeof value.name === 'string');
}

function isEvidence(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.kind === 'string' && isRecord(value.technology) && typeof value.technology.id === 'string' && typeof value.technology.displayName === 'string' && typeof value.signal === 'string' && isLocation(value.location);
}

function isResponsibilityFinding(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && isSubject(value.subject) && typeof value.responsibility === 'string' && (value.confidence === 'exact' || value.confidence === 'inferred') && isRecord(value.provenance) && isRecord(value.provenance.detector) && typeof value.provenance.detector.id === 'string' && typeof value.provenance.detector.version === 'string' && typeof value.provenance.ruleId === 'string' && typeof value.provenance.ruleVersion === 'string' && Array.isArray(value.evidence) && value.evidence.every(isEvidence);
}

function isLimitation(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && isScope(value.scope) && typeof value.code === 'string' && typeof value.message === 'string' && (value.evidenceIds === undefined || (Array.isArray(value.evidenceIds) && value.evidenceIds.every((id) => typeof id === 'string')));
}

function isEvaluation(value: Record<string, unknown>, detector: boolean): boolean {
  if (value.status === 'evaluated') return Array.isArray(value.limitationIds) && value.limitationIds.length === 0;
  if (value.status === 'partially-evaluated') return Array.isArray(value.limitationIds) && value.limitationIds.length > 0 && value.limitationIds.every((id) => typeof id === 'string');
  if (value.status === 'not-evaluated' || value.status === 'not-applicable') return detector || value.status === 'not-evaluated';
  if (value.status === 'unsupported') return !detector;
  return value.status === 'failed' && isRecord(value.failure) && typeof value.failure.code === 'string' && typeof value.failure.message === 'string' && Array.isArray(value.limitationIds);
}

function isCoverage(value: unknown): boolean {
  return isRecord(value) && typeof value.capability === 'string' && isScope(value.scope) && isEvaluation(value, false);
}

function isDetectorExecution(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && isRecord(value.detector) && typeof value.detector.id === 'string' && typeof value.detector.version === 'string' && typeof value.capability === 'string' && isScope(value.scope) && isEvaluation(value, true) && ((value.status === 'evaluated' || value.status === 'partially-evaluated' || value.status === 'failed') ? Array.isArray(value.findingIds) && value.findingIds.every((id) => typeof id === 'string') : true);
}

function readProjectLabel(snapshot: ExplorerSnapshot): string {
  const explicitLabel = snapshot.projectLabel?.trim();

  if (explicitLabel) {
    return explicitLabel;
  }

  if (snapshot.analysis.projectPath === '.') {
    return 'Analyzed project';
  }

  const pathSegments = snapshot.analysis.projectPath.split('/').filter(Boolean);
  return pathSegments.at(-1) ?? 'Analyzed project';
}


function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)) {
    return false;
  }

  return value.schemaVersion === 1
    && isRecord(value.analyzer)
    && Array.isArray(value.files)
    && Array.isArray(value.dependencies)
    && Array.isArray(value.unresolvedDependencies)
    && Array.isArray(value.diagnostics);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
