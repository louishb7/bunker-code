import { SyntaxKind, type ClassDeclaration, type Decorator, type MethodDeclaration, type SourceFile } from 'ts-morph';
import type { ResponsibilityEvidence, ResponsibilityFinding, ResponsibilityLimitation, ResponsibilitySubject } from '@bunker-code/contracts';
import type { TypeScriptAnalysisSession } from '../typescript-analysis-session.js';
import { responsibilityEvidenceId, responsibilityFindingId, responsibilityLimitationId, responsibilitySubjectId } from './identities.js';

export const NESTJS_TECHNOLOGY = { id: 'nestjs', displayName: 'NestJS' };

export function nestAliases(sourceFile: SourceFile): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== '@nestjs/common') continue;
    for (const item of declaration.getNamedImports()) aliases.set(item.getAliasNode()?.getText() ?? item.getName(), item.getName());
  }
  return aliases;
}

export function decoratorFor(node: ClassDeclaration | MethodDeclaration, aliases: ReadonlyMap<string, string>, name: string): Decorator | undefined {
  return node.getDecorators().find((decorator) => aliases.get(decorator.getName()) === name);
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

export function unsupportedAccessLimitations(session: TypeScriptAnalysisSession, detector: { id: string; version: string }): ResponsibilityLimitation[] {
  const limitations: ResponsibilityLimitation[] = [];
  for (const sourceFile of session.sourceFiles.values()) {
    const usesGlobal = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).find((node) => node.getName() === 'useGlobalGuards');
    if (usesGlobal) {
      const location = session.locationFor(usesGlobal);
      limitations.push({ id: responsibilityLimitationId(`file:${location.filePath}`, 'nestjs-use-global-guards', detector.id, detector.version), scope: { kind: 'file', fileId: location.filePath }, code: 'nestjs-use-global-guards', message: 'NestJS useGlobalGuards is observed but not classified in V1.' });
    }
    const appGuard = sourceFile.getImportDeclarations().find((item) => item.getModuleSpecifierValue() === '@nestjs/core')?.getNamedImports().find((item) => item.getName() === 'APP_GUARD');
    if (appGuard) {
      const location = session.locationFor(appGuard);
      limitations.push({ id: responsibilityLimitationId(`file:${location.filePath}`, 'nestjs-app-guard', detector.id, detector.version), scope: { kind: 'file', fileId: location.filePath }, code: 'nestjs-app-guard', message: 'NestJS APP_GUARD is observed but not classified in V1.' });
    }
  }
  return limitations.sort((left, right) => left.id.localeCompare(right.id));
}
