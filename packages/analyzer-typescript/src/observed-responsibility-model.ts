import type {
  AnalysisResult,
  ObservedResponsibilityClaim,
  ObservedResponsibilityFilePart,
  ResponsibilityFinding,
  ResponsibilitySubject,
} from '@bunker-code/contracts';

/**
 * Derives local file Parts for the observed static Responsibility perspective.
 * File metadata remains owned by the supplied analysis result.
 */
export function deriveObservedResponsibilityFileParts(
  analysis: AnalysisResult,
): ObservedResponsibilityFilePart[] {
  const fileIds = new Set<string>();

  for (const file of analysis.files) {
    if (fileIds.has(file.id)) {
      throw new Error(`Duplicate analyzed file ID: ${file.id}`);
    }

    fileIds.add(file.id);
  }

  return [...fileIds]
    .sort((left, right) => left.localeCompare(right))
    .map((fileId) => ({ fileId }));
}

function subjectDescription(subject: ResponsibilitySubject): string {
  return JSON.stringify([
    subject.kind, subject.fileId,
    subject.location.filePath, subject.location.line, subject.location.column,
    ...(subject.kind === 'file' ? [] : [subject.symbolId, subject.name]),
  ]);
}

/**
 * Groups positive findings within one source context. Rejects duplicate finding
 * IDs, conflicting descriptions of one subject, and references to absent Parts.
 * The caller retains the original findings for support and subject drillback.
 */
export function deriveObservedResponsibilityClaims(
  findings: readonly ResponsibilityFinding[],
  parts: readonly ObservedResponsibilityFilePart[],
): ObservedResponsibilityClaim[] {
  const fileIds = new Set(parts.map((part) => part.fileId));
  const findingIds = new Set<string>();
  const subjects = new Map<string, string>();
  const claims = new Map<string, ObservedResponsibilityClaim>();

  for (const finding of findings) {
    if (findingIds.has(finding.id)) {
      throw new Error(`Duplicate responsibility finding ID: ${finding.id}`);
    }
    findingIds.add(finding.id);

    const subject = finding.subject;
    if (!fileIds.has(subject.fileId)) {
      throw new Error(`Responsibility subject references missing File Part: ${subject.fileId}`);
    }
    const description = subjectDescription(subject);
    const previous = subjects.get(subject.id);
    if (previous !== undefined && previous !== description) {
      throw new Error(`Conflicting responsibility subject: ${subject.id}`);
    }
    subjects.set(subject.id, description);

    const key = JSON.stringify(['static-responsibility', subject.id, finding.responsibility]);
    const existing = claims.get(key);
    if (existing) {
      existing.supports.push({ findingId: finding.id });
    } else {
      claims.set(key, {
        key,
        subject: { kind: subject.kind, subjectId: subject.id, fileId: subject.fileId },
        responsibility: finding.responsibility,
        supports: [{ findingId: finding.id }],
      });
    }
  }

  return [...claims.values()].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0).map((claim) => {
    claim.supports.sort((left, right) => left.findingId < right.findingId ? -1 : left.findingId > right.findingId ? 1 : 0);
    return claim;
  });
}
