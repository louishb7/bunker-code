import type { PlannedSystemModel } from '@bunker-code/contracts';

export interface DesignTechnology { id: string; label: string }
export interface DesignImplementation {
  technologies: DesignTechnology[];
  assignments: { partId: string; technologyId: string }[];
}
export const emptyImplementation = (): DesignImplementation => ({ technologies: [], assignments: [] });
export const technologySuggestions = [
  'TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Node.js', 'NestJS', 'Express',
  'Fastify', 'React', 'Next.js', 'Vite', 'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB',
  'Redis', 'RabbitMQ', 'Kafka', 'Docker',
];

function object(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
export function technologyKey(label: string): string { return label.trim().normalize('NFKC').toLowerCase(); }

export function validateImplementation(value: unknown, model: PlannedSystemModel): DesignImplementation {
  if (!object(value, ['technologies', 'assignments']) || !Array.isArray(value.technologies) || !Array.isArray(value.assignments)) throw new TypeError('Invalid implementation: expected technologies and assignments.');
  const ids = new Set<string>(); const labels = new Set<string>();
  const technologies = value.technologies.map((item: unknown) => {
    if (!object(item, ['id', 'label']) || !text(item.id) || !text(item.label)) throw new TypeError('Invalid technology: id and label must be nonblank, trimmed strings.');
    if (ids.has(item.id) || labels.has(technologyKey(item.label))) throw new TypeError('Duplicate technology identity or label.');
    ids.add(item.id); labels.add(technologyKey(item.label));
    return { id: item.id, label: item.label };
  });
  const parts = new Set(model.parts.map((part) => part.id));
  const pairs = new Set<string>();
  const assignments = value.assignments.map((item: unknown) => {
    if (!object(item, ['partId', 'technologyId']) || !text(item.partId) || !text(item.technologyId) || !parts.has(item.partId) || !ids.has(item.technologyId)) throw new TypeError('Invalid assignment: Part and technology must exist in this document.');
    const pair = JSON.stringify([item.partId, item.technologyId]);
    if (pairs.has(pair)) throw new TypeError('Duplicate technology assignment.');
    pairs.add(pair);
    return { partId: item.partId, technologyId: item.technologyId };
  });
  return { technologies, assignments };
}

/** Reusing a label is idempotent; an inline custom technology and assignment are atomic. */
export function assignTechnology(value: DesignImplementation, model: PlannedSystemModel, partId: string, label: string, newId: string): DesignImplementation {
  const next = validateImplementation(value, model);
  const cleaned = label.trim();
  let technology = next.technologies.find((item) => technologyKey(item.label) === technologyKey(cleaned));
  if (!technology) { technology = { id: newId, label: cleaned }; next.technologies.push(technology); }
  if (!next.assignments.some((item) => item.partId === partId && item.technologyId === technology.id)) next.assignments.push({ partId, technologyId: technology.id });
  return validateImplementation(next, model);
}
export function unassignTechnology(value: DesignImplementation, model: PlannedSystemModel, partId: string, technologyId: string): DesignImplementation {
  const next = validateImplementation(value, model);
  next.assignments = next.assignments.filter((item) => item.partId !== partId || item.technologyId !== technologyId);
  return next;
}
export function removeTechnology(value: DesignImplementation, model: PlannedSystemModel, technologyId: string): DesignImplementation {
  const next = validateImplementation(value, model);
  if (!next.technologies.some((item) => item.id === technologyId)) throw new TypeError('Technology does not exist.');
  next.technologies = next.technologies.filter((item) => item.id !== technologyId);
  next.assignments = next.assignments.filter((item) => item.technologyId !== technologyId);
  return next;
}
/** Only a validated structural edit may remove assignments whose Parts were deleted. */
export function implementationAfterModelEdit(value: DesignImplementation, before: PlannedSystemModel, after: PlannedSystemModel): DesignImplementation {
  const next = validateImplementation(value, before);
  next.assignments = next.assignments.filter((item) => after.parts.some((part) => part.id === item.partId));
  return validateImplementation(next, after);
}
export function technologiesForPart(value: DesignImplementation, partId: string): DesignTechnology[] {
  const assigned = new Set(value.assignments.filter((item) => item.partId === partId).map((item) => item.technologyId));
  return value.technologies.filter((item) => assigned.has(item.id));
}
export function implementationStack(value: DesignImplementation) {
  return value.technologies.map((technology) => ({ technology, partIds: value.assignments.filter((item) => item.technologyId === technology.id).map((item) => item.partId) })).filter((entry) => entry.partIds.length > 0);
}
