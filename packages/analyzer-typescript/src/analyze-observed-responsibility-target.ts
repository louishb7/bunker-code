import type { ObservedResponsibilityUnit } from '@bunker-code/contracts';
import { analyzeTypeScriptTarget } from './analyze-project.js';
import { createObservedResponsibilityUnit } from './observed-responsibility-unit.js';

/**
 * Produces a static Responsibility view from one loaded TypeScript production.
 * `inputPath` locates the target; `representedTarget` is a nonblank local human
 * designation, not a filesystem-derived or historical identity. Production and
 * context errors propagate. The unit retains its sources and does not track
 * subsequent filesystem changes; treat it and its sources as immutable.
 */
export function analyzeObservedResponsibilityTarget(
  inputPath: string,
  representedTarget: string,
): ObservedResponsibilityUnit {
  const target = analyzeTypeScriptTarget(inputPath);
  return createObservedResponsibilityUnit(target.analysis, target.responsibilities, {
    profile: 'static-responsibility',
    nature: 'derived-from-static-analysis',
    implementationState: 'loaded-production',
    representedTarget,
  });
}
