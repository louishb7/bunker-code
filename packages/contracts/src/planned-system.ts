/** An authored intention. Its identity is local to the plan, not to an observed system. */
export interface PlannedSystemModel {
  schemaVersion: 1;
  id: string;
  context: {
    nature: 'planned-intention';
    representedSystem: string;
    /** Omission leaves the scope undeclared; it does not claim whole-system coverage. */
    scope?: string;
  };
  parts: PlannedPart[];
  predicates: PlannedPredicateDefinition[];
  relations: PlannedRelation[];
  claims: PlannedClaim[];
  openQuestions: PlannedOpenQuestion[];
}

export interface PlannedPart {
  id: string;
  label: string;
  description?: string;
}

export interface PlannedPredicateDefinition {
  id: string;
  label: string;
  /** Defines what source Part → target Part means for this predicate. */
  description: string;
}

export interface PlannedRelation {
  id: string;
  sourcePartId: string;
  targetPartId: string;
  predicateId: string;
  description?: string;
  rationale?: string;
  /** Author-supplied pointer, not evidence or a validated URL. */
  reference?: string;
}

export type PlannedSubjectRef =
  | { kind: 'model' }
  | { kind: 'part'; partId: string }
  | { kind: 'relation'; relationId: string };

export interface PlannedClaim {
  id: string;
  subject: PlannedSubjectRef;
  modality: 'required' | 'prohibited' | 'assumed';
  statement: string;
  rationale?: string;
  reference?: string;
}

export interface PlannedOpenQuestion {
  id: string;
  subject: PlannedSubjectRef;
  question: string;
  rationale?: string;
  reference?: string;
}
