export function responsibilitySubjectId(fileId: string, declarationKind: string, name: string, position: number): string {
  return `responsibility-subject:${fileId}:${declarationKind}:${name}:${position}`;
}

export function responsibilityEvidenceId(fileId: string, kind: string, technologyId: string, signal: string, position: number): string {
  return `responsibility-evidence:${fileId}:${kind}:${technologyId}:${signal}:${position}`;
}

export function responsibilityFindingId(subjectId: string, responsibility: string, detectorId: string, detectorVersion: string, ruleId: string, ruleVersion: string): string {
  return `responsibility-finding:${subjectId}:${responsibility}:${detectorId}:${detectorVersion}:${ruleId}:${ruleVersion}`;
}

export function responsibilityLimitationId(scopeId: string, code: string, detectorId: string, detectorVersion: string): string {
  return `responsibility-limitation:${scopeId}:${code}:${detectorId}:${detectorVersion}`;
}

export function detectorExecutionId(detectorId: string, detectorVersion: string, capability: string, scopeId: string): string {
  return `detector-execution:${detectorId}:${detectorVersion}:${capability}:${scopeId}`;
}
