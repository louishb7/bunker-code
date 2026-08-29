import { Node, SyntaxKind, type CallExpression, type ClassDeclaration, type Expression, type SourceFile } from 'ts-morph';
import type { ResponsibilityEvidence, ResponsibilityFinding, ResponsibilitySubject } from '@bunker-code/contracts';
import type { TypeScriptAnalysisSession } from '../typescript-analysis-session.js';
import type { ResponsibilityDetector } from './detector.js';
import { responsibilityEvidenceId, responsibilityFindingId, responsibilitySubjectId } from './identities.js';

const PRISMA_CLIENT = 'PrismaClient';
const MODEL_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);
const CLIENT_OPERATIONS = new Set(['$transaction', '$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe']);

export const PRISMA_TECHNOLOGY = { id: 'prisma', displayName: 'Prisma' };

interface PrismaImports {
  readonly references: ReadonlyMap<string, Node>;
}

interface PrismaSubclass {
  readonly declaration: ClassDeclaration;
  readonly importEvidence: ResponsibilityEvidence;
}

interface PrismaContext {
  readonly importsByFileId: ReadonlyMap<string, PrismaImports>;
  readonly subclassesByFileId: ReadonlyMap<string, ReadonlyMap<string, PrismaSubclass>>;
}

function evidenceFor(session: TypeScriptAnalysisSession, node: Node, kind: ResponsibilityEvidence['kind'], signal = node.getText()): ResponsibilityEvidence {
  const location = session.locationFor(node);
  return {
    id: responsibilityEvidenceId(location.filePath, kind, PRISMA_TECHNOLOGY.id, signal, node.getStart()),
    kind,
    technology: PRISMA_TECHNOLOGY,
    signal,
    location,
  };
}

function importsFor(sourceFile: SourceFile): PrismaImports {
  const references = new Map<string, Node>();

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== '@prisma/client') continue;

    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() === PRISMA_CLIENT) {
        references.set(namedImport.getAliasNode()?.getText() ?? PRISMA_CLIENT, namedImport);
      }
    }

    const namespace = declaration.getNamespaceImport();
    if (namespace) references.set(`${namespace.getText()}.${PRISMA_CLIENT}`, namespace);
  }

  return { references };
}

function sourceFileId(session: TypeScriptAnalysisSession, sourceFile: SourceFile): string {
  return session.locationFor(sourceFile).filePath;
}

function createContext(session: TypeScriptAnalysisSession): PrismaContext {
  const importsByFileId = new Map<string, PrismaImports>();
  const subclassesByFileId = new Map<string, ReadonlyMap<string, PrismaSubclass>>();

  for (const sourceFile of session.sourceFiles.values()) {
    const fileId = sourceFileId(session, sourceFile);
    const imports = importsFor(sourceFile);
    importsByFileId.set(fileId, imports);
    const subclasses = new Map<string, PrismaSubclass>();

    for (const declaration of sourceFile.getClasses()) {
      const base = declaration.getExtends();
      const importNode = base === undefined ? undefined : imports.references.get(base.getExpression().getText());
      const name = declaration.getName();

      if (name && importNode) {
        subclasses.set(name, {
          declaration,
          importEvidence: evidenceFor(session, importNode, 'import'),
        });
      }
    }

    subclassesByFileId.set(fileId, subclasses);
  }

  return { importsByFileId, subclassesByFileId };
}

function directPrismaSubclassForType(session: TypeScriptAnalysisSession, typeNode: Node, context: PrismaContext): PrismaSubclass | undefined {
  const declaration = typeNode.getType().getSymbol()?.getDeclarations().find((item): item is ClassDeclaration => Node.isClassDeclaration(item));
  const name = declaration?.getName();

  if (!declaration || !name) return undefined;
  return context.subclassesByFileId.get(sourceFileId(session, declaration.getSourceFile()))?.get(name);
}

function typeEvidenceFor(session: TypeScriptAnalysisSession, typeNode: Node | undefined, context: PrismaContext): ResponsibilityEvidence[] | undefined {
  if (!typeNode) return undefined;

  const fileId = sourceFileId(session, typeNode.getSourceFile());
  const imports = context.importsByFileId.get(fileId);
  const importNode = imports?.references.get(typeNode.getText());

  if (importNode) return [evidenceFor(session, importNode, 'import'), evidenceFor(session, typeNode, 'type-reference')];

  const subclass = context.subclassesByFileId.get(fileId)?.get(typeNode.getText()) ?? directPrismaSubclassForType(session, typeNode, context);
  if (!subclass) return undefined;

  const base = subclass.declaration.getExtends();
  if (!base) return undefined;
  return [subclass.importEvidence, evidenceFor(session, base, 'declaration', `extends ${base.getText()}`), evidenceFor(session, typeNode, 'type-reference')];
}

function bindingDeclarationFor(receiver: Expression): Node | undefined {
  if (Node.isIdentifier(receiver)) return receiver.getSymbol()?.getValueDeclaration();
  if (Node.isPropertyAccessExpression(receiver) && receiver.getExpression().getKind() === SyntaxKind.ThisKeyword) {
    return receiver.getNameNode().getSymbol()?.getValueDeclaration();
  }
  return undefined;
}

function bindingEvidenceFor(session: TypeScriptAnalysisSession, receiver: Expression, context: PrismaContext): ResponsibilityEvidence[] | undefined {
  const declaration = bindingDeclarationFor(receiver);
  if (!declaration) return undefined;

  if (Node.isVariableDeclaration(declaration)) {
    const typed = typeEvidenceFor(session, declaration.getTypeNode(), context);
    if (typed) return typed;

    const initializer = declaration.getInitializer();
    if (Node.isNewExpression(initializer)) {
      const imports = context.importsByFileId.get(sourceFileId(session, declaration.getSourceFile()));
      const importNode = imports?.references.get(initializer.getExpression().getText());
      if (importNode) return [evidenceFor(session, importNode, 'import'), evidenceFor(session, declaration, 'declaration')];
    }
  }

  if (Node.isParameterDeclaration(declaration) || Node.isPropertyDeclaration(declaration)) {
    return typeEvidenceFor(session, declaration.getTypeNode(), context);
  }

  return undefined;
}

function rootForSupportedOperation(call: CallExpression): Expression | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return undefined;

  const operation = expression.getName();
  const receiver = expression.getExpression();
  if (CLIENT_OPERATIONS.has(operation)) return receiver;
  if (!MODEL_OPERATIONS.has(operation) || !Node.isPropertyAccessExpression(receiver)) return undefined;
  return receiver.getExpression();
}

function symbolSubject(session: TypeScriptAnalysisSession, node: Node, kind: 'method' | 'function', name: string): ResponsibilitySubject {
  const location = session.locationFor(node);
  const id = responsibilitySubjectId(location.filePath, kind, name, node.getStart());
  return { id, kind, fileId: location.filePath, symbolId: id, name, location };
}

function subjectForCall(session: TypeScriptAnalysisSession, call: CallExpression): ResponsibilitySubject {
  const method = call.getFirstAncestorByKind(SyntaxKind.MethodDeclaration);
  if (method) return symbolSubject(session, method, 'method', method.getName() ?? '<anonymous>');

  const functionDeclaration = call.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
  if (functionDeclaration) return symbolSubject(session, functionDeclaration, 'function', functionDeclaration.getName() ?? '<anonymous>');

  const functionExpression = call.getFirstAncestorByKind(SyntaxKind.ArrowFunction) ?? call.getFirstAncestorByKind(SyntaxKind.FunctionExpression);
  if (functionExpression) {
    const variable = functionExpression.getParentIfKind(SyntaxKind.VariableDeclaration);
    return symbolSubject(session, functionExpression, 'function', variable?.getName() ?? '<anonymous>');
  }

  const sourceFile = call.getSourceFile();
  const location = session.locationFor(sourceFile);
  const id = responsibilitySubjectId(location.filePath, 'file', location.filePath, sourceFile.getStart());
  return { id, kind: 'file', fileId: location.filePath, location };
}

function findingFor(subject: ResponsibilitySubject, evidence: ResponsibilityEvidence[]): ResponsibilityFinding {
  const detector = { id: 'prisma.persistence', version: '1' };
  const ruleId = 'prisma-client-operation';
  const ruleVersion = '1';
  return {
    id: responsibilityFindingId(subject.id, 'persistence-interaction', detector.id, detector.version, ruleId, ruleVersion),
    subject,
    responsibility: 'persistence-interaction',
    confidence: 'exact',
    provenance: { detector, ruleId, ruleVersion },
    evidence: [...evidence].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export const prismaPersistenceDetector: ResponsibilityDetector = {
  detector: { id: 'prisma.persistence', version: '1' },
  capability: 'persistence-interaction',
  analyze(session) {
    const context = createContext(session);
    if (![...context.importsByFileId.values()].some((imports) => imports.references.size > 0)) {
      return { status: 'not-applicable', findings: [], limitations: [] };
    }

    const evidenceBySubject = new Map<string, { subject: ResponsibilitySubject; evidence: Map<string, ResponsibilityEvidence> }>();
    const sourceFiles = [...session.sourceFiles.values()].sort((left, right) => sourceFileId(session, left).localeCompare(sourceFileId(session, right)));

    for (const sourceFile of sourceFiles) {
      for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const root = rootForSupportedOperation(call);
        if (!root) continue;
        const bindingEvidence = bindingEvidenceFor(session, root, context);
        if (!bindingEvidence) continue;

        const subject = subjectForCall(session, call);
        const current = evidenceBySubject.get(subject.id) ?? { subject, evidence: new Map<string, ResponsibilityEvidence>() };
        for (const evidence of [...bindingEvidence, evidenceFor(session, call, 'call')]) current.evidence.set(evidence.id, evidence);
        evidenceBySubject.set(subject.id, current);
      }
    }

    return {
      status: 'evaluated',
      findings: [...evidenceBySubject.values()]
        .map(({ subject, evidence }) => findingFor(subject, [...evidence.values()]))
        .sort((left, right) => left.id.localeCompare(right.id)),
      limitations: [],
    };
  },
};
