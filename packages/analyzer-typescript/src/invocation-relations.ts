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

export type ExperimentalUnclassifiedInvocationReason =
  | 'unresolved-target'
  | 'multiple-target-declarations'
  | 'unsupported-call-form'
  | 'target-outside-analyzed-files';

export interface ExperimentalUnclassifiedInvocationCall {
  callSite: SourceLocation;
  reason: ExperimentalUnclassifiedInvocationReason;
}

export interface ExperimentalInvocationExtraction {
  exactRelations: ExperimentalInvocationRelation[];
  unclassifiedCalls: ExperimentalUnclassifiedInvocationCall[];
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

type CalleeResolution =
  | { kind: 'exact'; declaration: FunctionDeclaration }
  | { kind: 'unclassified'; reason: ExperimentalUnclassifiedInvocationReason };

function resolveImportedFunction(
  session: TypeScriptAnalysisSession,
  call: Node,
): CalleeResolution {
  if (!Node.isCallExpression(call)) return { kind: 'unclassified', reason: 'unsupported-call-form' };

  const expression = call.getExpression();
  if (!Node.isIdentifier(expression)) return { kind: 'unclassified', reason: 'unsupported-call-form' };

  const symbol = expression.getSymbol();
  const target = symbol?.getAliasedSymbol();
  if (!target) return { kind: 'unclassified', reason: 'unresolved-target' };

  const declarations = target.getDeclarations();
  if (declarations.length === 0) return { kind: 'unclassified', reason: 'unresolved-target' };
  if (declarations.length !== 1) return { kind: 'unclassified', reason: 'multiple-target-declarations' };
  const [declaration] = declarations;
  if (!declaration || !Node.isFunctionDeclaration(declaration)) return { kind: 'unclassified', reason: 'unsupported-call-form' };
  if (!fileIdFor(session, declaration.getSourceFile())) return { kind: 'unclassified', reason: 'target-outside-analyzed-files' };

  return { kind: 'exact', declaration };
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

function compareUnclassifiedCalls(
  left: ExperimentalUnclassifiedInvocationCall,
  right: ExperimentalUnclassifiedInvocationCall,
): number {
  return (
    left.callSite.filePath.localeCompare(right.callSite.filePath) ||
    left.callSite.line - right.callSite.line ||
    left.callSite.column - right.callSite.column ||
    left.reason.localeCompare(right.reason)
  );
}

/**
 * Extracts the deliberately narrow Phase 8A proof: a named imported function
 * invoked from a named function declaration, where ts-morph resolves exactly
 * one analyzed function declaration. Every other observed call keeps only its
 * site and the narrow factual reason it could not be classified as exact.
 */
export function extractExactInternalInvocationRelations(
  session: TypeScriptAnalysisSession,
): ExperimentalInvocationExtraction {
  const exactRelations: ExperimentalInvocationRelation[] = [];
  const unclassifiedCalls: ExperimentalUnclassifiedInvocationCall[] = [];

  for (const sourceFile of [...session.sourceFiles.values()].sort((left, right) =>
    session.locationFor(left).filePath.localeCompare(session.locationFor(right).filePath),
  )) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callSite = session.locationFor(call);
      const callerDeclaration = closestFunctionLikeAncestor(call);
      if (!callerDeclaration || !Node.isFunctionDeclaration(callerDeclaration)) {
        unclassifiedCalls.push({ callSite, reason: 'unsupported-call-form' });
        continue;
      }

      const calleeResolution = resolveImportedFunction(session, call);
      if (calleeResolution.kind === 'unclassified') {
        unclassifiedCalls.push({ callSite, reason: calleeResolution.reason });
        continue;
      }

      const caller = subjectFor(session, callerDeclaration);
      const callee = subjectFor(session, calleeResolution.declaration);
      if (!caller || !callee) {
        unclassifiedCalls.push({ callSite, reason: 'unsupported-call-form' });
        continue;
      }

      exactRelations.push({ caller, callee, callSite, confidence: 'exact' });
    }
  }

  return {
    exactRelations: exactRelations.sort(compareRelations),
    unclassifiedCalls: unclassifiedCalls.sort(compareUnclassifiedCalls),
  };
}
