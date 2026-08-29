export function responsibilitySubjectId(fileId: string, declarationKind: string, name: string, position: number): string {
  return `responsibility-subject:${fileId}:${declarationKind}:${name}:${position}`;
}

export function responsibilityEvidenceId(fileId: string, kind: string, technologyId: string, signal: string, position: number): string {
  return `responsibility-evidence:${fileId}:${kind}:${technologyId}:${signal}:${position}`;
}

export function responsibilityFindingId(subjectId: string, responsibility: string, ruleId: string): string {
  return `responsibility-finding:${subjectId}:${responsibility}:${ruleId}`;
}

export function responsibilityLimitationId(scopeId: string, code: string): string {
  return `responsibility-limitation:${scopeId}:${code}`;
}

export function detectorExecutionId(detectorId: string, detectorVersion: string, capability: string): string {
  return `detector-execution:${detectorId}:${detectorVersion}:${capability}`;
}
