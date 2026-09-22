import type { PlannedSystemModel } from '@bunker-code/contracts';
import { validatePlannedSystemModel } from './validate-planned-system-model.js';

export interface CreatePlannedSystemModelInput {
  id?: string;
  representedSystem: string;
  scope?: string;
}

/** Creates a blank, valid authored model; supplied text is never silently repaired. */
export function createPlannedSystemModel(input: CreatePlannedSystemModelInput): PlannedSystemModel {
  const model = {
    schemaVersion: 1,
    id: Object.hasOwn(input, 'id') ? input.id : crypto.randomUUID(),
    context: {
      nature: 'planned-intention',
      representedSystem: input.representedSystem,
      ...(Object.hasOwn(input, 'scope') ? { scope: input.scope } : {}),
    },
    parts: [],
    predicates: [],
    relations: [],
    claims: [],
    openQuestions: [],
  };
  const result = validatePlannedSystemModel(model);
  if (!result.ok) {
    const first = result.errors[0];
    throw new TypeError(`Invalid planned model input at ${first?.path.join('.') ?? '<root>'}: ${first?.message ?? 'unknown error'}`);
  }
  return result.value;
}
