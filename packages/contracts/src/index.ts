export interface AnalysisResult {
  /** Path of the analyzed project root, relative to itself. */
  projectPath: string;
  /** Path of the tsconfig used for analysis, relative to the analyzed project. */
  tsconfigPath: string;
  files: AnalyzedFile[];
  dependencies: ResolvedDependency[];
  unresolvedDependencies: UnresolvedDependency[];
  /** Non-fatal issues found while producing a partial but usable result. */
  diagnostics: AnalysisDiagnostic[];
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

export type UnresolvedDependencyReason = 'relative-target-not-found';

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
