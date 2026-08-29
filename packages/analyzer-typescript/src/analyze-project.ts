import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Project, SourceFile } from 'ts-morph';
import { ANALYSIS_SCHEMA_VERSION } from './analysis-result.js';
import { detectPnpmWorkspace, type DetectedPnpmWorkspace } from './pnpm-workspace.js';
import type {
  AnalysisDiagnostic,
  AnalysisResult,
  AnalyzedFile,
  DependencyEvidence,
  ResolvedDependency,
  UnresolvedDependency,
} from './analysis-result.js';
import { createTypeScriptAnalysisSession, type TypeScriptAnalysisSession } from './typescript-analysis-session.js';
import { analyzeResponsibilitiesWithSession, responsibilityDetectors } from './responsibility-detectors/runtime.js';
import type { ResponsibilityAnalysisResult } from '@bunker-code/contracts';

function normalizeProjectPath(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replaceAll('\\', '/');
}

function isPathInsideProject(relativePath: string): boolean {
  return relativePath !== '..' && !relativePath.startsWith('../') && !path.isAbsolute(relativePath);
}

function isExternalModuleSpecifier(moduleSpecifier: string): boolean {
  return !moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/');
}

interface PathAliasPattern {
  pattern: string;
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
}

function sortByDependency<
  T extends {
    sourceFileId: string;
    moduleSpecifier: string;
    kind?: string;
    targetFileId?: string;
    evidence: { location: { line: number; column: number } };
  },
>(
  items: T[],
): T[] {
  return [...items].sort((left, right) =>
    left.sourceFileId.localeCompare(right.sourceFileId) ||
    left.moduleSpecifier.localeCompare(right.moduleSpecifier) ||
    (left.kind ?? '').localeCompare(right.kind ?? '') ||
    (left.targetFileId ?? '').localeCompare(right.targetFileId ?? '') ||
    left.evidence.location.line - right.evidence.location.line ||
    left.evidence.location.column - right.evidence.location.column,
  );
}

function pathAliasPatterns(project: Project): PathAliasPattern[] {
  const paths = project.getCompilerOptions().paths ?? {};

  return Object.keys(paths)
    .sort()
    .map((pattern) => {
      const wildcardIndex = pattern.indexOf('*');

      if (wildcardIndex === -1) {
        return {
          pattern,
          prefix: pattern,
          suffix: '',
          hasWildcard: false,
        };
      }

      return {
        pattern,
        prefix: pattern.slice(0, wildcardIndex),
        suffix: pattern.slice(wildcardIndex + 1),
        hasWildcard: true,
      };
    });
}

function matchesConfiguredPathAlias(moduleSpecifier: string, patterns: readonly PathAliasPattern[]): boolean {
  return patterns.some((pattern) => {
    if (!pattern.hasWildcard) {
      return moduleSpecifier === pattern.pattern;
    }

    return (
      moduleSpecifier.length >= pattern.prefix.length + pattern.suffix.length &&
      moduleSpecifier.startsWith(pattern.prefix) &&
      moduleSpecifier.endsWith(pattern.suffix)
    );
  });
}

function recordDependency(params: {
  projectPath: string;
  sourceFilePath: string;
  moduleSpecifier: string;
  matchesConfiguredPathAlias: boolean;
  analyzedSourceFileIds: ReadonlySet<string>;
  targetSourceFile: SourceFile | undefined;
  evidence: DependencyEvidence;
  dependencies: ResolvedDependency[];
  unresolvedDependencies: UnresolvedDependency[];
  diagnostics: AnalysisDiagnostic[];
}): void {
  const {
    projectPath,
    sourceFilePath,
    moduleSpecifier,
    matchesConfiguredPathAlias,
    analyzedSourceFileIds,
    targetSourceFile,
    evidence,
    dependencies,
    unresolvedDependencies,
    diagnostics,
  } = params;

  if (targetSourceFile) {
    const targetFileId = normalizeProjectPath(projectPath, targetSourceFile.getFilePath());

    if (analyzedSourceFileIds.has(targetFileId)) {
      dependencies.push({
        sourceFileId: sourceFilePath,
        targetFileId,
        moduleSpecifier,
        kind: 'internal',
        evidence,
        confidence: 'exact',
      });
      return;
    }

    dependencies.push({
      sourceFileId: sourceFilePath,
      moduleSpecifier,
      kind: 'external',
      evidence,
      confidence: 'inferred',
    });
    return;
  }

  if (matchesConfiguredPathAlias) {
    unresolvedDependencies.push({
      sourceFileId: sourceFilePath,
      moduleSpecifier,
      reason: 'configured-internal-target-not-found',
      evidence,
      confidence: 'exact',
    });
    diagnostics.push({
      code: 'unresolved-dependency',
      severity: 'warning',
      message: `Unable to resolve configured internal dependency "${moduleSpecifier}" from "${sourceFilePath}".`,
      evidence,
    });
    return;
  }

  if (isExternalModuleSpecifier(moduleSpecifier)) {
    dependencies.push({
      sourceFileId: sourceFilePath,
      moduleSpecifier,
      kind: 'external',
      evidence,
      confidence: 'inferred',
    });
    return;
  }

  unresolvedDependencies.push({
    sourceFileId: sourceFilePath,
    moduleSpecifier,
    reason: 'relative-target-not-found',
    evidence,
    confidence: 'exact',
  });
  diagnostics.push({
    code: 'unresolved-dependency',
    severity: 'warning',
    message: `Unable to resolve relative dependency "${moduleSpecifier}" from "${sourceFilePath}".`,
    evidence,
  });
}

function createAnalysisResult(
  projectPath: string,
  tsconfigPaths: readonly string[],
  includeSourceFile: (sourceFilePath: string) => boolean,
  configuration: { tsconfigPath?: string; workspaceConfigurationPath?: string },
  existingSession?: TypeScriptAnalysisSession,
): AnalysisResult {
  const session = existingSession ?? createTypeScriptAnalysisSession(projectPath, tsconfigPaths, includeSourceFile);
  const sourceFiles = session.sourceFiles;
  const files: AnalyzedFile[] = session.files;
  const analyzedSourceFileIds = new Set(files.map((file) => file.id));
  const dependencies: ResolvedDependency[] = [];
  const unresolvedDependencies: UnresolvedDependency[] = [];
  const diagnostics: AnalysisDiagnostic[] = [];

  for (const [sourceFilePath, sourceFile] of [...sourceFiles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const configuredPathAliasPatterns = pathAliasPatterns(sourceFile.getProject());

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
      const position = importDeclaration.getModuleSpecifier().getStart();
      const location = sourceFile.getLineAndColumnAtPos(position);
      const evidence: DependencyEvidence = {
        location: { filePath: sourceFilePath, line: location.line, column: location.column },
      };

      recordDependency({
        projectPath,
        sourceFilePath,
        moduleSpecifier,
        matchesConfiguredPathAlias: matchesConfiguredPathAlias(moduleSpecifier, configuredPathAliasPatterns),
        analyzedSourceFileIds,
        targetSourceFile: importDeclaration.getModuleSpecifierSourceFile(),
        evidence,
        dependencies,
        unresolvedDependencies,
        diagnostics,
      });
    }

    for (const exportDeclaration of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();
      const moduleSpecifierNode = exportDeclaration.getModuleSpecifier();

      if (!moduleSpecifier || !moduleSpecifierNode) {
        continue;
      }

      const position = moduleSpecifierNode.getStart();
      const location = sourceFile.getLineAndColumnAtPos(position);
      const evidence: DependencyEvidence = {
        location: { filePath: sourceFilePath, line: location.line, column: location.column },
      };

      recordDependency({
        projectPath,
        sourceFilePath,
        moduleSpecifier,
        matchesConfiguredPathAlias: matchesConfiguredPathAlias(moduleSpecifier, configuredPathAliasPatterns),
        analyzedSourceFileIds,
        targetSourceFile: exportDeclaration.getModuleSpecifierSourceFile(),
        evidence,
        dependencies,
        unresolvedDependencies,
        diagnostics,
      });
    }
  }

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    analyzer: { name: '@bunker-code/analyzer-typescript', language: 'typescript' },
    projectPath: '.',
    ...configuration,
    files,
    dependencies: sortByDependency(dependencies),
    unresolvedDependencies: sortByDependency(unresolvedDependencies),
    diagnostics: [...diagnostics].sort((left, right) =>
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message) ||
      (left.evidence?.location.filePath ?? '').localeCompare(right.evidence?.location.filePath ?? '') ||
      (left.evidence?.location.line ?? 0) - (right.evidence?.location.line ?? 0) ||
      (left.evidence?.location.column ?? 0) - (right.evidence?.location.column ?? 0),
    ),
  };
}

function withWorkspaceStructure(analysis: AnalysisResult, workspace: DetectedPnpmWorkspace): AnalysisResult {
  const packageByFileId = new Map<string, string>();

  for (const file of analysis.files) {
    const workspacePackage = workspace.packages
      .filter((candidate) => file.path === candidate.rootPath || file.path.startsWith(`${candidate.rootPath}/`))
      .sort((left, right) => right.rootPath.length - left.rootPath.length || left.id.localeCompare(right.id))[0];

    if (workspacePackage) {
      packageByFileId.set(file.id, workspacePackage.id);
    }
  }

  return {
    ...analysis,
    structure: {
      packages: workspace.packages,
      fileMemberships: [...packageByFileId.entries()]
        .map(([fileId, workspacePackageId]) => ({ fileId, workspacePackageId }))
        .sort((left, right) => left.fileId.localeCompare(right.fileId)),
    },
  };
}

interface LoadedTarget {
  projectPath: string;
  session: TypeScriptAnalysisSession;
  configuration: { tsconfigPath?: string; workspaceConfigurationPath?: string };
  workspace?: DetectedPnpmWorkspace;
}

function loadTarget(inputPath: string): LoadedTarget {
  const projectPath = path.resolve(inputPath);
  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) throw new Error(`Project directory not found: ${projectPath}`);
  const tsconfigPath = path.join(projectPath, 'tsconfig.json');
  if (existsSync(tsconfigPath)) return { projectPath, session: createTypeScriptAnalysisSession(projectPath, [tsconfigPath], () => true), configuration: { tsconfigPath: normalizeProjectPath(projectPath, tsconfigPath) } };
  const workspace = detectPnpmWorkspace(projectPath);
  if (!workspace || workspace.rootPath !== projectPath) throw new Error(`tsconfig.json not found: ${tsconfigPath}`);
  const tsconfigPaths = workspace.packages.map((item) => path.join(workspace.rootPath, item.rootPath, 'tsconfig.json')).filter((item) => existsSync(item)).sort();
  return { projectPath, session: createTypeScriptAnalysisSession(projectPath, tsconfigPaths, isPathInsideProject), configuration: { workspaceConfigurationPath: normalizeProjectPath(projectPath, workspace.configurationPath) }, workspace };
}

function analysisForTarget(target: LoadedTarget): AnalysisResult {
  const analysis = createAnalysisResult(target.projectPath, [], () => true, target.configuration, target.session);
  return target.workspace ? withWorkspaceStructure(analysis, target.workspace) : analysis;
}

/**
 * Analyzes either a TypeScript project root with `tsconfig.json` or a PNPM
 * workspace root declared by `pnpm-workspace.yaml`.
 *
 * The returned contract is JSON-serializable and uses paths relative to the
 * analyzed target. A project target has `tsconfigPath`; a workspace target has
 * `workspaceConfigurationPath`. Fatal input errors are thrown when the target
 * directory or its required configuration cannot be found.
 */
export function analyzeProject(inputPath: string): AnalysisResult {
  return analysisForTarget(loadTarget(inputPath));
}

export interface TypeScriptTargetAnalysis {
  analysis: AnalysisResult;
  responsibilities: ResponsibilityAnalysisResult;
}

export function analyzeTypeScriptTarget(inputPath: string): TypeScriptTargetAnalysis {
  const target = loadTarget(inputPath);
  return {
    analysis: analysisForTarget(target),
    responsibilities: analyzeResponsibilitiesWithSession(target.session, responsibilityDetectors),
  };
}
