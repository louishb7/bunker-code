export { analyzeProject, analyzeTypeScriptTarget } from './analyze-project.js';
export type { TypeScriptTargetAnalysis } from './analyze-project.js';
export { discoverAnalysisTargets, resolveAnalysisTarget } from './project-discovery.js';
export type {
  AnalysisTargetEvidence,
  DiscoveredAnalysisTarget,
} from './project-discovery.js';
export { ANALYSIS_SCHEMA_VERSION } from './analysis-result.js';
export type {
  AnalysisDiagnostic,
  AnalysisAnalyzerMetadata,
  AnalysisProjectStructure,
  AnalysisResult,
  AnalysisSchemaVersion,
  AnalyzedFile,
  Confidence,
  DependencyEvidence,
  DependencyKind,
  ResolvedDependency,
  SourceLocation,
  UnresolvedDependency,
  UnresolvedDependencyReason,
  FileWorkspacePackageMembership,
  WorkspacePackage,
  WorkspacePackageEvidence,
} from './analysis-result.js';
