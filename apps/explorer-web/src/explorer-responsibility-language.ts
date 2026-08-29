import type { Responsibility, ResponsibilityFamily, ResponsibilitySubject } from '@bunker-code/contracts';

export function responsibilityLabel(responsibility: Responsibility): string {
  return titleCase(responsibility);
}

export function responsibilityFamilyLabel(family: ResponsibilityFamily): string {
  return titleCase(family);
}

export function responsibilitySubjectLabel(subject: ResponsibilitySubject): string {
  if (subject.kind === 'file') return subject.fileId;
  return subject.kind === 'method' || subject.kind === 'function' ? `${subject.name}()` : subject.name;
}

export function responsibilitySubjectKindLabel(subject: ResponsibilitySubject): string {
  return titleCase(subject.kind);
}

export function responsibilityLocationLabel(subject: ResponsibilitySubject): string {
  return `${subject.location.filePath}:${subject.location.line}:${subject.location.column}`;
}

export function coverageStatusLabel(status: 'evaluated' | 'partially-evaluated' | 'not-evaluated' | 'unsupported' | 'failed'): string {
  if (status === 'partially-evaluated') return 'Partially evaluated';
  if (status === 'not-evaluated') return 'Not evaluated';
  return titleCase(status);
}

function titleCase(value: string): string {
  return value
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
