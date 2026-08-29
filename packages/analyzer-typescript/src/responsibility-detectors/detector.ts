import type {
  DetectorIdentity,
  ResponsibilityEvaluationFailure,
  ResponsibilityFinding,
  ResponsibilityLimitation,
  Responsibility,
} from '@bunker-code/contracts';
import type { TypeScriptAnalysisSession } from '../typescript-analysis-session.js';

export type DetectorOutcome =
  | { status: 'evaluated'; findings: ResponsibilityFinding[]; limitations: [] }
  | { status: 'partially-evaluated'; findings: ResponsibilityFinding[]; limitations: [ResponsibilityLimitation, ...ResponsibilityLimitation[]] }
  | { status: 'not-evaluated'; findings: []; limitations: [] }
  | { status: 'not-applicable'; findings: []; limitations: [] }
  | { status: 'failed'; findings: []; limitations: []; failure: ResponsibilityEvaluationFailure };

export interface ResponsibilityDetector {
  detector: DetectorIdentity;
  capability: Responsibility;
  analyze(session: TypeScriptAnalysisSession): DetectorOutcome;
}
