import type { ClassDeclaration, Decorator, MethodDeclaration, SourceFile } from 'ts-morph';
import type { ResponsibilityEvidence, ResponsibilityFinding, ResponsibilitySubject } from '@bunker-code/contracts';
import type { TypeScriptAnalysisSession } from '../typescript-analysis-session.js';
import { responsibilityEvidenceId, responsibilityFindingId, responsibilitySubjectId } from './identities.js';

export const NESTJS_TECHNOLOGY = { id: 'nestjs', displayName: 'NestJS' };

export function nestAliases(sourceFile: SourceFile): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== '@nestjs/common') continue;
    for (const item of declaration.getNamedImports()) aliases.set(item.getAliasNode()?.getText() ?? item.getName(), item.getName());
    const namespace = declaration.getNamespaceImport()?.getText();
    if (namespace) for (const name of ['Controller', 'Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All', 'UseGuards', 'Module']) aliases.set(`${namespace}.${name}`, name);
  }
  return aliases;
}

export function decoratorFor(node: ClassDeclaration | MethodDeclaration, aliases: ReadonlyMap<string, string>, name: string): Decorator | undefined {
  return node.getDecorators().find((decorator) => aliases.get(decoratorKey(decorator)) === name);
}

export function decoratorKey(decorator: Decorator): string {
  return decorator.getText().slice(1).split('(')[0]!.trim();
}

export function subjectFor(session: TypeScriptAnalysisSession, node: ClassDeclaration | MethodDeclaration): ResponsibilitySubject {
  const location = session.locationFor(node);
  const name = node.getName() ?? '<anonymous>';
  const kind = node.getKindName() === 'ClassDeclaration' ? 'class' as const : 'method' as const;
  const id = responsibilitySubjectId(location.filePath, kind, name, node.getStart());
  return { id, kind, fileId: location.filePath, symbolId: id, name, location };
}

export function evidenceFor(session: TypeScriptAnalysisSession, decorator: Decorator): ResponsibilityEvidence {
  const location = session.locationFor(decorator);
  return { id: responsibilityEvidenceId(location.filePath, 'annotation', NESTJS_TECHNOLOGY.id, decorator.getText(), decorator.getStart()), kind: 'annotation', technology: NESTJS_TECHNOLOGY, signal: decorator.getText(), location };
}

export function findingFor(subject: ResponsibilitySubject, responsibility: ResponsibilityFinding['responsibility'], detector: { id: string; version: string }, ruleId: string, evidence: ResponsibilityEvidence[]): ResponsibilityFinding {
  const ruleVersion = '1';
  return { id: responsibilityFindingId(subject.id, responsibility, detector.id, detector.version, ruleId, ruleVersion), subject, responsibility, confidence: 'exact', provenance: { detector, ruleId, ruleVersion }, evidence };
}

export function nestApplicable(session: TypeScriptAnalysisSession): boolean {
  return [...session.sourceFiles.values()].some((sourceFile) => sourceFile.getImportDeclarations().some((item) => item.getModuleSpecifierValue() === '@nestjs/common'));
}
