import { Node, SyntaxKind, type FunctionDeclaration, type SourceFile } from 'ts-morph';
import type { SourceLocation } from '@bunker-code/contracts';
import type { TypeScriptAnalysisSession } from './typescript-analysis-session.js';

/**
 * Experimental local identity for a function subject. It is intentionally
 * confined to this proof and is not an architectural or public symbol ID.
 */
export interface ExperimentalInvocationSubject {
  id: string;
  fileId: string;
  name: string;
}

export interface ExperimentalInvocationRelation {
  caller: ExperimentalInvocationSubject;
  callee: ExperimentalInvocationSubject;
  callSite: SourceLocation;
  confidence: 'exact';
}

function fileIdFor(session: TypeScriptAnalysisSession, sourceFile: SourceFile): string | undefined {
  const fileId = session.locationFor(sourceFile).filePath;
  return session.sourceFiles.get(fileId) === sourceFile ? fileId : undefined;
}

function subjectFor(session: TypeScriptAnalysisSession, declaration: FunctionDeclaration): ExperimentalInvocationSubject | undefined {
  const name = declaration.getName();
  const fileId = fileIdFor(session, declaration.getSourceFile());

  if (!name || !fileId) return undefined;

  return {
    id: `experimental-invocation:function:${fileId}:${declaration.getStart()}`,
    fileId,
    name,
  };
}

function closestFunctionLikeAncestor(call: Node): Node | undefined {
  return call.getFirstAncestor((ancestor) =>
    Node.isFunctionDeclaration(ancestor) ||
    Node.isArrowFunction(ancestor) ||
    Node.isFunctionExpression(ancestor) ||
    Node.isMethodDeclaration(ancestor),
  );
}

function exactImportedFunctionFor(call: Node): FunctionDeclaration | undefined {
  if (!Node.isCallExpression(call)) return undefined;

  const expression = call.getExpression();
  if (!Node.isIdentifier(expression)) return undefined;

  const symbol = expression.getSymbol();
  const target = symbol?.getAliasedSymbol();
  const declarations = target?.getDeclarations() ?? [];

  if (declarations.length !== 1 || !Node.isFunctionDeclaration(declarations[0])) return undefined;
  return declarations[0];
}

function compareRelations(left: ExperimentalInvocationRelation, right: ExperimentalInvocationRelation): number {
  return (
    left.caller.id.localeCompare(right.caller.id) ||
    left.callee.id.localeCompare(right.callee.id) ||
    left.callSite.filePath.localeCompare(right.callSite.filePath) ||
    left.callSite.line - right.callSite.line ||
    left.callSite.column - right.callSite.column
  );
}

/**
 * Extracts the deliberately narrow Phase 8A proof: a named imported function
 * invoked from a named function declaration, where ts-morph resolves exactly
 * one analyzed function declaration. Unsupported calls produce no relation.
 */
export function extractExactInternalInvocationRelations(
  session: TypeScriptAnalysisSession,
): ExperimentalInvocationRelation[] {
  const relations: ExperimentalInvocationRelation[] = [];

  for (const sourceFile of [...session.sourceFiles.values()].sort((left, right) =>
    session.locationFor(left).filePath.localeCompare(session.locationFor(right).filePath),
  )) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callerDeclaration = closestFunctionLikeAncestor(call);
      if (!callerDeclaration || !Node.isFunctionDeclaration(callerDeclaration)) continue;

      const calleeDeclaration = exactImportedFunctionFor(call);
      if (!calleeDeclaration) continue;

      const caller = subjectFor(session, callerDeclaration);
      const callee = subjectFor(session, calleeDeclaration);
      if (!caller || !callee) continue;

      relations.push({ caller, callee, callSite: session.locationFor(call), confidence: 'exact' });
    }
  }

  return relations.sort(compareRelations);
}
