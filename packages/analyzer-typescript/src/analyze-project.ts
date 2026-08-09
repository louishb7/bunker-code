import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Project } from 'ts-morph';
import type {
  AnalysisResult,
  AnalyzedFile,
  ResolvedImport,
  UnresolvedImport,
} from './analysis-result.js';

function normalizeProjectPath(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replaceAll('\\', '/');
}

function sortByPath<T extends { path: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.path.localeCompare(right.path));
}

function sortByImport<T extends { sourceFile: string; moduleSpecifier: string; location: { line: number; column: number } }>(
  items: T[],
): T[] {
  return [...items].sort((left, right) =>
    left.sourceFile.localeCompare(right.sourceFile) ||
    left.moduleSpecifier.localeCompare(right.moduleSpecifier) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column,
  );
}

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
      path: normalizeProjectPath(projectPath, sourceFile.getFilePath()),
    })),
  );

  const imports: ResolvedImport[] = [];
  const unresolvedImports: UnresolvedImport[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = normalizeProjectPath(projectPath, sourceFile.getFilePath());

    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
      const position = importDeclaration.getModuleSpecifier().getStart();
      const location = sourceFile.getLineAndColumnAtPos(position);
      const entry = {
        sourceFile: sourceFilePath,
        moduleSpecifier,
        location: {
          line: location.line,
          column: location.column,
        },
      };
      const targetSourceFile = importDeclaration.getModuleSpecifierSourceFile();

      if (targetSourceFile) {
        imports.push({
          ...entry,
          targetFile: normalizeProjectPath(projectPath, targetSourceFile.getFilePath()),
        });
        continue;
      }

      unresolvedImports.push(entry);
    }
  }

  return {
    projectPath: '.',
    tsconfigPath: normalizeProjectPath(projectPath, tsconfigPath),
    files,
    imports: sortByImport(imports),
    unresolvedImports: sortByImport(unresolvedImports),
  };
}
