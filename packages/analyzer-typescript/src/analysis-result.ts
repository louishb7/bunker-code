export interface AnalysisResult {
  projectPath: string;
  tsconfigPath: string;
  files: AnalyzedFile[];
  imports: ResolvedImport[];
  unresolvedImports: UnresolvedImport[];
}

export interface AnalyzedFile {
  path: string;
}

export interface ImportLocation {
  line: number;
  column: number;
}

export interface ResolvedImport {
  sourceFile: string;
  moduleSpecifier: string;
  targetFile: string;
  location: ImportLocation;
}

export interface UnresolvedImport {
  sourceFile: string;
  moduleSpecifier: string;
  location: ImportLocation;
}
