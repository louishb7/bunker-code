import type {
  AnalysisResult,
  ObservedStaticCodeFilePart,
  ObservedStaticCodeUnit,
  ObservedStaticDependencyRelation,
  ResolvedDependency,
} from '@bunker-code/contracts';

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function relationKey(sourceFileId: string, targetFileId: string): string {
  return JSON.stringify(['static-file-dependency', sourceFileId, targetFileId]);
}

function dependencyKey(dependency: ResolvedDependency): string {
  if (dependency.kind !== 'internal' || dependency.targetFileId === undefined) {
    throw new Error(`Static dependency support requires an internal target: ${dependency.sourceFileId}`);
  }
  const { filePath, line, column } = dependency.evidence.location;
  return JSON.stringify([
    'static-dependency-support', dependency.sourceFileId, dependency.targetFileId,
    dependency.kind, dependency.moduleSpecifier, filePath, line, column, dependency.confidence,
  ]);
}

/** Derives file-to-file relations while retaining every original source record. */
export function deriveObservedStaticDependencyRelations(
  analysis: AnalysisResult,
  parts: readonly ObservedStaticCodeFilePart[],
): ObservedStaticDependencyRelation[] {
  const partIds = new Set(parts.map((part) => part.fileId));
  const filesById = new Map(analysis.files.map((file) => [file.id, file]));
  const relations = new Map<string, { sourceFileId: string; targetFileId: string; supports: Set<string> }>();

  for (const dependency of analysis.dependencies) {
    if (dependency.kind === 'external') {
      if (dependency.targetFileId !== undefined) {
        throw new Error(`External dependency has an internal target: ${dependency.sourceFileId}`);
      }
      continue;
    }
    if (dependency.kind !== 'internal') {
      throw new Error(`Unknown dependency kind: ${String(dependency.kind)}`);
    }
    const source = filesById.get(dependency.sourceFileId);
    if (!source || !partIds.has(source.id)) {
      throw new Error(`Static dependency source references missing File Part: ${dependency.sourceFileId}`);
    }
    if (dependency.targetFileId === undefined) {
      throw new Error(`Internal dependency has no target file: ${dependency.sourceFileId}`);
    }
    if (!partIds.has(dependency.targetFileId) || !filesById.has(dependency.targetFileId)) {
      throw new Error(`Static dependency target references missing File Part: ${dependency.targetFileId}`);
    }
    const { filePath, line, column } = dependency.evidence.location;
    if (filePath !== source.path || !Number.isSafeInteger(line) || line < 1 ||
      !Number.isSafeInteger(column) || column < 1) {
      throw new Error(`Invalid static dependency evidence location: ${dependency.sourceFileId}`);
    }

    const key = relationKey(source.id, dependency.targetFileId);
    const relation = relations.get(key) ?? {
      sourceFileId: source.id,
      targetFileId: dependency.targetFileId,
      supports: new Set<string>(),
    };
    relation.supports.add(dependencyKey(dependency));
    relations.set(key, relation);
  }

  return [...relations.entries()]
    .sort(([left], [right]) => compareKeys(left, right))
    .map(([key, relation]) => ({
      key,
      sourceFileId: relation.sourceFileId,
      targetFileId: relation.targetFileId,
      supports: [...relation.supports].sort(compareKeys).map((dependencyKey) => ({ dependencyKey })),
    }));
}

/** Resolves supports by value after serialization; identical copies have one logical address. */
export function resolveObservedStaticDependencySupports(
  unit: ObservedStaticCodeUnit,
  relation: ObservedStaticDependencyRelation,
): ResolvedDependency[] {
  if (relation.key !== relationKey(relation.sourceFileId, relation.targetFileId)) {
    throw new Error(`Invalid static dependency relation key: ${relation.key}`);
  }
  const dependenciesByKey = new Map<string, ResolvedDependency>();
  for (const dependency of unit.sources.analysis.dependencies) {
    if (dependency.kind === 'internal' && dependency.targetFileId !== undefined) {
      dependenciesByKey.set(dependencyKey(dependency), dependency);
    }
  }
  return relation.supports.map(({ dependencyKey: key }) => {
    const dependency = dependenciesByKey.get(key);
    if (!dependency) throw new Error(`Missing static dependency support: ${key}`);
    if (dependency.sourceFileId !== relation.sourceFileId || dependency.targetFileId !== relation.targetFileId) {
      throw new Error(`Inconsistent static dependency support: ${key}`);
    }
    return dependency;
  });
}
