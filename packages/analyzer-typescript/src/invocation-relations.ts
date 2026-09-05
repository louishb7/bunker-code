import { Node, SyntaxKind, type FunctionDeclaration, type MethodDeclaration, type PropertyAccessExpression, type SourceFile } from 'ts-morph';
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

export interface ExperimentalStaticMethodInvocationSubject extends ExperimentalInvocationSubject {
  kind: 'static-method';
}

export interface ExperimentalInvocationRelation {
  caller: ExperimentalInvocationSubject;
  callee: ExperimentalInvocationSubject | ExperimentalStaticMethodInvocationSubject;
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

function subjectFor(
  session: TypeScriptAnalysisSession,
  declaration: FunctionDeclaration | MethodDeclaration,
): ExperimentalInvocationSubject | ExperimentalStaticMethodInvocationSubject | undefined {
  const name = declaration.getName();
  const fileId = fileIdFor(session, declaration.getSourceFile());

  if (!name || !fileId) return undefined;

  if (Node.isMethodDeclaration(declaration)) {
    return {
      id: `experimental-invocation:static-method:${fileId}:${declaration.getStart()}`,
      kind: 'static-method',
      fileId,
      name,
    };
  }

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
    Node.isMethodDeclaration(ancestor) ||
    Node.isConstructorDeclaration(ancestor) ||
    Node.isGetAccessorDeclaration(ancestor) ||
    Node.isSetAccessorDeclaration(ancestor) ||
    Node.isClassDeclaration(ancestor) ||
    Node.isClassExpression(ancestor),
  );
}

type CalleeResolution =
  | { kind: 'exact'; declaration: FunctionDeclaration | MethodDeclaration }
  | { kind: 'unclassified'; reason: ExperimentalUnclassifiedInvocationReason };

function resolveIdentifierFunction(
  session: TypeScriptAnalysisSession,
  call: Node,
): CalleeResolution {
  if (!Node.isCallExpression(call)) return { kind: 'unclassified', reason: 'unsupported-call-form' };

  const expression = call.getExpression();
  if (!Node.isIdentifier(expression)) return { kind: 'unclassified', reason: 'unsupported-call-form' };

  const symbol = expression.getSymbol();
  const target = symbol?.getAliasedSymbol() ?? symbol;
  if (!target) return { kind: 'unclassified', reason: 'unresolved-target' };

  const declarations = target.getDeclarations();
  if (declarations.length === 0) return { kind: 'unclassified', reason: 'unresolved-target' };
  if (declarations.length !== 1) return { kind: 'unclassified', reason: 'multiple-target-declarations' };
  const [declaration] = declarations;
  if (!declaration || !Node.isFunctionDeclaration(declaration)) return { kind: 'unclassified', reason: 'unsupported-call-form' };
  if (!fileIdFor(session, declaration.getSourceFile())) return { kind: 'unclassified', reason: 'target-outside-analyzed-files' };

  return { kind: 'exact', declaration };
}

function resolveStaticMethod(
  session: TypeScriptAnalysisSession,
  expression: PropertyAccessExpression,
): CalleeResolution {
  const receiver = expression.getExpression();
  if (expression.hasQuestionDotToken() || !Node.isIdentifier(receiver)) {
    return { kind: 'unclassified', reason: 'unsupported-call-form' };
  }

  const symbol = receiver.getSymbol();
  const classes = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
  if (classes.length === 0) return { kind: 'unclassified', reason: 'unresolved-target' };
  if (classes.length !== 1) return { kind: 'unclassified', reason: 'multiple-target-declarations' };
  const [classDeclaration] = classes;
  if (!classDeclaration || !Node.isClassDeclaration(classDeclaration)) return { kind: 'unclassified', reason: 'unsupported-call-form' };
  if (!fileIdFor(session, classDeclaration.getSourceFile())) return { kind: 'unclassified', reason: 'target-outside-analyzed-files' };
  if (classDeclaration.getExtends()) return { kind: 'unclassified', reason: 'unsupported-call-form' };

  const declarations = expression.getNameNode().getSymbol()?.getDeclarations() ?? [];
  if (declarations.length === 0) return { kind: 'unclassified', reason: 'unresolved-target' };
  if (declarations.length !== 1) return { kind: 'unclassified', reason: 'multiple-target-declarations' };
  const [declaration] = declarations;
  if (!declaration || !Node.isMethodDeclaration(declaration)) return { kind: 'unclassified', reason: 'unsupported-call-form' };
  if (!fileIdFor(session, declaration.getSourceFile())) return { kind: 'unclassified', reason: 'target-outside-analyzed-files' };
  if (!declaration.isStatic() || declaration.getParent() !== classDeclaration ||
      !Node.isIdentifier(declaration.getNameNode())) {
    return { kind: 'unclassified', reason: 'unsupported-call-form' };
  }

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
 * Resolves named functions and directly owned static methods from named
 * function callers. Exactness describes a unique analyzed declaration, not
 * runtime execution. Other observed CallExpressions retain their site and
 * technical limitation; NewExpressions are outside this experiment.
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

      const expression = call.getExpression();
      const calleeResolution: CalleeResolution = Node.isPropertyAccessExpression(expression)
        ? call.hasQuestionDotToken()
          ? { kind: 'unclassified', reason: 'unsupported-call-form' }
          : resolveStaticMethod(session, expression)
        : resolveIdentifierFunction(session, call);
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
