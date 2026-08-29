import type { AnalysisAnalyzerMetadata, SourceLocation } from './index.js';

export const RESPONSIBILITY_TAXONOMY = [
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
] as const;

export type ResponsibilityFamily = (typeof RESPONSIBILITY_TAXONOMY)[number]['family'];

export type Responsibility = (typeof RESPONSIBILITY_TAXONOMY)[number]['responsibility'];

export type ResponsibilityConfidence = 'exact' | 'inferred';

export interface FileResponsibilitySubject {
  /** Stable analyzer-defined identity for this subject. */
  id: string;
  kind: 'file';
  fileId: string;
}

export interface SymbolResponsibilitySubject {
  /** Stable analyzer-defined identity for this subject. */
  id: string;
  kind: 'class' | 'method' | 'function';
  /** Stable analyzer-defined identity within the containing file. */
  symbolId: string;
  fileId: string;
  name: string;
}

export type ResponsibilitySubject = FileResponsibilitySubject | SymbolResponsibilitySubject;

export type ResponsibilityEvidenceKind =
  | 'annotation'
  | 'call'
  | 'configuration'
  | 'declaration'
  | 'import'
  | 'metadata'
  | 'registration'
  | 'type-reference';

export interface ResponsibilityEvidence {
  /** Stable analyzer-defined identity for this observed signal. */
  id: string;
  kind: ResponsibilityEvidenceKind;
  /** Concrete technology observed by the detector, never a canonical responsibility. */
  technology: string;
  /** Concrete source-level signal observed by the detector. */
  signal: string;
  location: SourceLocation;
}

export interface ResponsibilityProvenance {
  detector: DetectorIdentity;
  ruleId: string;
  ruleVersion: string;
}

export interface ResponsibilityFinding {
  /** Stable analyzer-defined identity for this positive finding. */
  id: string;
  subject: ResponsibilitySubject;
  responsibility: Responsibility;
  confidence: ResponsibilityConfidence;
  provenance: ResponsibilityProvenance;
  evidence: ResponsibilityEvidence[];
}

export type ResponsibilityEvaluationStatus =
  | 'evaluated'
  | 'partially-evaluated'
  | 'not-evaluated'
  | 'unsupported'
  | 'failed';

export type ResponsibilityEvaluationScope =
  | { kind: 'project' }
  | { kind: 'file'; fileId: string }
  | { kind: 'subject'; subject: ResponsibilitySubject };

export interface ResponsibilityLimitation {
  /** Stable analyzer-defined identity for this coverage limitation. */
  id: string;
  scope: ResponsibilityEvaluationScope;
  code: string;
  message: string;
  evidenceIds?: string[];
}

export interface ResponsibilityEvaluationFailure {
  code: string;
  message: string;
  evidence?: ResponsibilityEvidence[];
}

interface ResponsibilityEvaluationBase {
  limitationIds?: string[];
}

export type ResponsibilityEvaluation =
  | (ResponsibilityEvaluationBase & {
    status: Exclude<ResponsibilityEvaluationStatus, 'failed'>;
  })
  | (ResponsibilityEvaluationBase & {
    status: 'failed';
    failure: ResponsibilityEvaluationFailure;
  });

export type ResponsibilityCoverage = ResponsibilityEvaluation & {
  capability: Responsibility;
  scope: ResponsibilityEvaluationScope;
};

export type DetectorExecutionStatus = ResponsibilityEvaluationStatus | 'not-applicable';

export interface DetectorIdentity {
  id: string;
  version: string;
}

export type DetectorExecution = (ResponsibilityEvaluation | {
  status: 'not-applicable';
}) & {
  /** Stable analyzer-defined identity for this detector execution. */
  id: string;
  detector: DetectorIdentity;
  capability: Responsibility;
  scope: ResponsibilityEvaluationScope;
  findingIds?: string[];
  limitationIds?: string[];
};

export const RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION = 1;

export type ResponsibilityAnalysisSchemaVersion = typeof RESPONSIBILITY_ANALYSIS_SCHEMA_VERSION;

export interface ResponsibilityAnalysisResult {
  schemaVersion: ResponsibilityAnalysisSchemaVersion;
  analyzer: AnalysisAnalyzerMetadata;
  /** Path of the analyzed project, relative to itself. */
  projectPath: string;
  findings: ResponsibilityFinding[];
  coverage: ResponsibilityCoverage[];
  detectorExecutions: DetectorExecution[];
  limitations: ResponsibilityLimitation[];
}
