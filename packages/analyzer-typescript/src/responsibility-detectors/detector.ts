import type {
  DetectorIdentity,
  ResponsibilityEvaluationFailure,
  ResponsibilityFinding,
  ResponsibilityLimitation,
  Responsibility,
} from '@bunker-code/contracts';
import type { TypeScriptAnalysisSession } from '../typescript-analysis-session.js';

export type DetectorOutcome =
  | { status: 'evaluated'; findings: ResponsibilityFinding[]; limitations: ResponsibilityLimitation[] }
  | { status: 'partially-evaluated'; findings: ResponsibilityFinding[]; limitations: ResponsibilityLimitation[] }
  | { status: 'not-evaluated'; findings: ResponsibilityFinding[]; limitations: ResponsibilityLimitation[] }
  | { status: 'not-applicable'; findings: ResponsibilityFinding[]; limitations: ResponsibilityLimitation[] }
  | { status: 'failed'; findings: ResponsibilityFinding[]; limitations: ResponsibilityLimitation[]; failure: ResponsibilityEvaluationFailure };

export interface ResponsibilityDetector {
  detector: DetectorIdentity;
  capability: Responsibility;
  analyze(session: TypeScriptAnalysisSession): DetectorOutcome;
}
