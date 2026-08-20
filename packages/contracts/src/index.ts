export const ANALYSIS_SCHEMA_VERSION = 1;

export type AnalysisSchemaVersion = typeof ANALYSIS_SCHEMA_VERSION;

export interface AnalysisResult {
  schemaVersion: AnalysisSchemaVersion;
  analyzer: AnalysisAnalyzerMetadata;
  /** Path of the analyzed project root, relative to itself. */
  projectPath: string;
  /** Path of the tsconfig used for analysis, relative to the analyzed project. */
  tsconfigPath: string;
  files: AnalyzedFile[];
  dependencies: ResolvedDependency[];
  unresolvedDependencies: UnresolvedDependency[];
  /** Non-fatal issues found while producing a partial but usable result. */
  diagnostics: AnalysisDiagnostic[];
  /** Present when the analyzed input is a PNPM workspace root. */
  structure?: AnalysisProjectStructure;
}

export interface AnalysisAnalyzerMetadata {
  name: string;
  language: string;
}

export interface AnalyzedFile {
  /** Deterministic file identifier. Currently equal to the normalized relative path. */
  id: string;
  /** Normalized path relative to the analyzed project, using `/` separators. */
  path: string;
}

export type Confidence = 'exact' | 'inferred' | 'uncertain';

export type DependencyKind = 'internal' | 'external';

export type DiagnosticSeverity = 'warning' | 'error';

export type UnresolvedDependencyReason = 'relative-target-not-found' | 'configured-internal-target-not-found';

export interface SourceLocation {
  /** Normalized path relative to the analyzed project, using `/` separators. */
  filePath: string;
  line: number;
  column: number;
}

export interface DependencyEvidence {
  /** Location of the module specifier that produced this dependency record. */
  location: SourceLocation;
}

export interface ResolvedDependency {
  sourceFileId: string;
  /** Present only when the dependency resolves to a file inside the analyzed project. */
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

/** Serializable containment facts discovered from an explicitly declared workspace. */
export interface AnalysisProjectStructure {
  packages: WorkspacePackage[];
  fileMemberships: FileWorkspacePackageMembership[];
}

export interface WorkspacePackage {
  /** Stable identity derived from the workspace-relative root path. */
  id: string;
  kind: 'workspace-package';
  origin: 'detected';
  /** Normalized path relative to the workspace root, using `/` separators. */
  rootPath: string;
  /** The optional logical identity declared by package.json. */
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
