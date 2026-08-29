import path from 'node:path';
import { Project, type Node, type SourceFile } from 'ts-morph';
import type { AnalyzedFile, SourceLocation } from '@bunker-code/contracts';

export interface TypeScriptAnalysisSession {
  projectPath: string;
  sourceFiles: ReadonlyMap<string, SourceFile>;
  files: AnalyzedFile[];
  locationFor(node: Node): SourceLocation;
}

function normalizeProjectPath(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replaceAll('\\', '/');
}

export function createTypeScriptAnalysisSession(
  projectPath: string,
  tsconfigPaths: readonly string[],
  includeSourceFile: (sourceFilePath: string) => boolean,
): TypeScriptAnalysisSession {
  const sourceFiles = new Map<string, SourceFile>();

  for (const tsconfigPath of tsconfigPaths) {
    let project: Project;

    try {
      project = new Project({ tsConfigFilePath: tsconfigPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid TypeScript project configuration: ${message}`);
    }

    for (const sourceFile of project.getSourceFiles()) {
      const fileId = normalizeProjectPath(projectPath, sourceFile.getFilePath());

      if (includeSourceFile(fileId)) {
        sourceFiles.set(fileId, sourceFile);
      }
    }
  }

  const files = [...sourceFiles.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((fileId) => ({ id: fileId, path: fileId }));

  return {
    projectPath,
    sourceFiles,
    files,
    locationFor(node) {
      const sourceFile = node.getSourceFile();
      const filePath = normalizeProjectPath(projectPath, sourceFile.getFilePath());
      const position = sourceFile.getLineAndColumnAtPos(node.getStart());

      return { filePath, line: position.line, column: position.column };
    },
  };
}
