import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';
import type {
  AnalysisDiagnostic,
  AnalysisResult,
  AnalyzedFile,
  DependencyEvidence,
  ResolvedDependency,
  UnresolvedDependency,
} from './analysis-result.js';

function normalizeProjectPath(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replaceAll('\\', '/');
}

function isPathInsideProject(relativePath: string): boolean {
  return relativePath !== '..' && !relativePath.startsWith('../') && !path.isAbsolute(relativePath);
}

function isExternalModuleSpecifier(moduleSpecifier: string): boolean {
  return !moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/');
}

function sortByPath<T extends { path: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.path.localeCompare(right.path));
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

/**
 * Analyzes a TypeScript project using its local `tsconfig.json`.
 *
 * The returned contract is JSON-serializable and uses paths relative to the
 * analyzed project. Fatal input errors are thrown when the project directory or
 * its `tsconfig.json` cannot be found.
 */
export function analyzeProject(inputPath: string): AnalysisResult {
  const projectPath = path.resolve(inputPath);

  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    throw new Error(`Project directory not found: ${projectPath}`);
  }

  const tsconfigPath = path.join(projectPath, 'tsconfig.json');

  if (!existsSync(tsconfigPath)) {
    throw new Error(`tsconfig.json not found: ${tsconfigPath}`);
  }

  const project = new Project({ tsConfigFilePath: tsconfigPath });

  const files: AnalyzedFile[] = sortByPath(
    project.getSourceFiles().map((sourceFile) => ({
      id: normalizeProjectPath(projectPath, sourceFile.getFilePath()),
      path: normalizeProjectPath(projectPath, sourceFile.getFilePath()),
    })),
  );

  const dependencies: ResolvedDependency[] = [];
  const unresolvedDependencies: UnresolvedDependency[] = [];
  const diagnostics: AnalysisDiagnostic[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = normalizeProjectPath(projectPath, sourceFile.getFilePath());

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
      const position = importDeclaration.getModuleSpecifier().getStart();
      const location = sourceFile.getLineAndColumnAtPos(position);
      const evidence: DependencyEvidence = {
        location: {
          filePath: sourceFilePath,
          line: location.line,
          column: location.column,
        },
      };
      const targetSourceFile = importDeclaration.getModuleSpecifierSourceFile();

      if (targetSourceFile) {
        const targetFileId = normalizeProjectPath(projectPath, targetSourceFile.getFilePath());

        if (isPathInsideProject(targetFileId)) {
          dependencies.push({
            sourceFileId: sourceFilePath,
            targetFileId,
            moduleSpecifier,
            kind: 'internal',
            evidence,
            confidence: 'exact',
          });
          continue;
        }

        dependencies.push({
          sourceFileId: sourceFilePath,
          moduleSpecifier,
          kind: 'external',
          evidence,
          confidence: 'inferred',
        });
        continue;
      }

      if (isExternalModuleSpecifier(moduleSpecifier)) {
        dependencies.push({
          sourceFileId: sourceFilePath,
          moduleSpecifier,
          kind: 'external',
          evidence,
          confidence: 'inferred',
        });
        continue;
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
  }

  return {
    projectPath: '.',
    tsconfigPath: normalizeProjectPath(projectPath, tsconfigPath),
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
