import type { ObservedStaticCodeUnit } from '@bunker-code/contracts';
import { analyzeTypeScriptTarget } from './analyze-project.js';
import { createObservedStaticCodeUnit } from './observed-static-code-unit.js';

/** Produces one loaded, local static-code unit without claiming runtime behavior. */
export function analyzeObservedStaticCodeTarget(
  inputPath: string,
  representedTarget: string,
): ObservedStaticCodeUnit {
  const target = analyzeTypeScriptTarget(inputPath);
  return createObservedStaticCodeUnit(target.analysis, target.responsibilities, {
    profile: 'static-code-analysis',
    nature: 'derived-from-static-analysis',
    implementationState: 'loaded-production',
    representedTarget,
  });
}
