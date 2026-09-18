import type { AnalysisResult } from './analysis.js';
import type { Responsibility, ResponsibilityAnalysisResult, ResponsibilitySubject } from './responsibility.js';

/**
 * A file analyzed by the source analysis, represented as a local Part in the
 * observed static Responsibility perspective.
 */
export interface ObservedResponsibilityFilePart {
  /** Local key and reference to `AnalysisResult.files[*].id`. */
  fileId: string;
}

export interface ObservedResponsibilitySubjectRef {
  kind: ResponsibilitySubject['kind'];
  subjectId: string;
  fileId: string;
}

/** Positive static classification of a technical subject, not a runtime assertion. */
export interface ObservedResponsibilityClaim {
  /** JSON tuple [static-responsibility, subjectId, responsibility], local to the source context. */
  key: string;
  subject: ObservedResponsibilitySubjectRef;
  responsibility: Responsibility;
  /** References into the original findings; epistemic data remains in those records. */
  supports: { findingId: string }[];
}

export interface ObservedResponsibilityContext {
  readonly profile: 'static-responsibility';
  readonly nature: 'derived-from-static-analysis';
  /** Caller-supplied local designation, not a filesystem address or global identity. */
  readonly representedTarget: string;
  readonly implementationState: 'loaded-production';
}

/**
 * A derived view of one caller-asserted production. Sources and model must be
 * treated as an immutable snapshot; changing sources requires rebuilding it.
 * Local Part/Claim keys do not identify entities across units.
 */
export interface ObservedResponsibilityUnit {
  readonly schemaVersion: 1;
  readonly context: ObservedResponsibilityContext;
  readonly sources: {
    readonly analysis: AnalysisResult;
    readonly responsibilities: ResponsibilityAnalysisResult;
  };
  readonly model: {
    readonly parts: readonly ObservedResponsibilityFilePart[];
    readonly claims: readonly ObservedResponsibilityClaim[];
  };
}
