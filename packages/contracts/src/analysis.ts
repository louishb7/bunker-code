export const ANALYSIS_SCHEMA_VERSION = 1;

export type AnalysisSchemaVersion = typeof ANALYSIS_SCHEMA_VERSION;

export interface AnalysisResult {
  schemaVersion: AnalysisSchemaVersion;
  analyzer: AnalysisAnalyzerMetadata;
  projectPath: string;
  tsconfigPath?: string;
  workspaceConfigurationPath?: string;
  files: AnalyzedFile[];
  dependencies: ResolvedDependency[];
  unresolvedDependencies: UnresolvedDependency[];
  diagnostics: AnalysisDiagnostic[];
  structure?: AnalysisProjectStructure;
}

export interface AnalysisAnalyzerMetadata {
  name: string;
  language: string;
}

export interface AnalyzedFile {
  id: string;
  path: string;
}

export type Confidence = 'exact' | 'inferred' | 'uncertain';
export type DependencyKind = 'internal' | 'external';
export type DiagnosticSeverity = 'warning' | 'error';
export type UnresolvedDependencyReason = 'relative-target-not-found' | 'configured-internal-target-not-found';

export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface DependencyEvidence {
  location: SourceLocation;
}

export interface ResolvedDependency {
  sourceFileId: string;
  targetFileId?: string;
  moduleSpecifier: string;
  kind: DependencyKind;
  evidence: DependencyEvidence;
  confidence: Confidence;
}

export interface UnresolvedDependency {
  sourceFileId: string;
  moduleSpecifier: string;
  reason: UnresolvedDependencyReason;
  evidence: DependencyEvidence;
  confidence: Confidence;
}

export interface AnalysisDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  evidence?: DependencyEvidence;
}

export interface AnalysisProjectStructure {
  packages: WorkspacePackage[];
  fileMemberships: FileWorkspacePackageMembership[];
}

export interface WorkspacePackage {
  id: string;
  kind: 'workspace-package';
  origin: 'detected';
  rootPath: string;
  name?: string;
  evidence: WorkspacePackageEvidence[];
}

export type WorkspacePackageEvidence =
  | { kind: 'workspace-configuration'; path: string }
  | { kind: 'workspace-pattern'; pattern: string }
  | { kind: 'package-manifest'; path: string };

export interface FileWorkspacePackageMembership {
  fileId: string;
  workspacePackageId: string;
}
