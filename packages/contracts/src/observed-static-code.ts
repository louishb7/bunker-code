import type { AnalysisResult } from './analysis.js';
import type { ObservedResponsibilityClaim, ObservedResponsibilityFilePart } from './observed-responsibility.js';
import type { ResponsibilityAnalysisResult } from './responsibility.js';

/** The existing file Part shape, owned once by the composed static-code unit. */
export type ObservedStaticCodeFilePart = ObservedResponsibilityFilePart;

export interface ObservedStaticCodeContext {
  readonly profile: 'static-code-analysis';
  readonly nature: 'derived-from-static-analysis';
  /** Local human designation, not a filesystem address or historical identity. */
  readonly representedTarget: string;
  readonly implementationState: 'loaded-production';
}

/** A resolved internal static dependency from one analyzed file to another. */
export interface ObservedStaticDependencyRelation {
  /** Local JSON tuple [static-file-dependency, sourceFileId, targetFileId]. */
  readonly key: string;
  readonly sourceFileId: string;
  readonly targetFileId: string;
  /** Distinct technical occurrences in sources.analysis.dependencies. */
  readonly supports: readonly { readonly dependencyKey: string }[];
}

/**
 * One loaded static production with shared file Parts and specialized views.
 * The public producer supplies both reports from one session; direct builders
 * require callers to guarantee common origin. Sources must remain unchanged
 * after construction. Keys identify records only within this unit and make
 * no historical claim.
 */
export interface ObservedStaticCodeUnit {
  readonly schemaVersion: 1;
  readonly context: ObservedStaticCodeContext;
  readonly sources: {
    readonly analysis: AnalysisResult;
    readonly responsibilities: ResponsibilityAnalysisResult;
  };
  readonly model: {
    readonly parts: readonly ObservedStaticCodeFilePart[];
    readonly responsibility: {
      readonly claims: readonly ObservedResponsibilityClaim[];
    };
    readonly dependencies: {
      readonly relations: readonly ObservedStaticDependencyRelation[];
    };
  };
}
