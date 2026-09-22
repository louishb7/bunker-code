import type {
  AnalysisResult,
  ObservedStaticCodeContext,
  ObservedStaticCodeUnit,
  ResponsibilityAnalysisResult,
} from '@bunker-code/contracts';
import { createObservedResponsibilityUnit } from './observed-responsibility-unit.js';
import { deriveObservedStaticDependencyRelations } from './observed-static-dependency-model.js';

/** Builds the two specialized views from one caller-asserted static production. */
export function createObservedStaticCodeUnit(
  analysis: AnalysisResult,
  responsibilities: ResponsibilityAnalysisResult,
  context: ObservedStaticCodeContext,
): ObservedStaticCodeUnit {
  if (context.profile !== 'static-code-analysis' || context.nature !== 'derived-from-static-analysis' ||
    context.implementationState !== 'loaded-production' || !context.representedTarget.trim()) {
    throw new Error('Invalid observed static-code context.');
  }
  const responsibility = createObservedResponsibilityUnit(analysis, responsibilities, {
    profile: 'static-responsibility',
    nature: context.nature,
    implementationState: context.implementationState,
    representedTarget: context.representedTarget,
  });
  const parts = responsibility.model.parts;
  const relations = deriveObservedStaticDependencyRelations(analysis, parts);

  return {
    schemaVersion: 1,
    context: { ...context },
    sources: responsibility.sources,
    model: {
      parts,
      responsibility: { claims: responsibility.model.claims },
      dependencies: { relations },
    },
  };
}
