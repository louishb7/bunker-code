export const vocabularyConceptIds = [
  'workspace',
  'workspace-package',
  'detected-part',
  'analyzed-file',
  'dependency',
  'dependent',
  'filesystem-group',
  'external-module',
  'contextual-file',
  'file-connections',
  'connection-anchor',
  'evidence',
  'module-specifier',
  'confidence',
] as const;

export type VocabularyConceptId = typeof vocabularyConceptIds[number];

export interface VocabularyConcept {
  id: VocabularyConceptId;
  friendlyTerm: string;
  technicalTerm: string;
  explanation: string;
}

export const explorerVocabulary = {
  workspace: {
    id: 'workspace',
    friendlyTerm: 'A project with separately declared parts',
    technicalTerm: 'PNPM workspace',
    explanation: 'When BunkerCode finds pnpm-workspace.yaml, it uses that supported declaration to detect the project parts. A project without this declaration remains a project-file view and is not presented as a workspace.',
  },
  'workspace-package': {
    id: 'workspace-package',
    friendlyTerm: 'Part of this system',
    technicalTerm: 'Workspace package',
    explanation: 'A workspace package is a part matched by the supported PNPM workspace configuration and backed by its own local package.json. It has its own root, and analyzed files can belong to it.',
  },
  'detected-part': {
    id: 'detected-part',
    friendlyTerm: 'A part BunkerCode found',
    technicalTerm: 'Detected part',
    explanation: 'Detected means the supported workspace configuration and local manifest identify this part. BunkerCode does not infer that it is a service, layer, or domain.',
  },
  'analyzed-file': {
    id: 'analyzed-file',
    friendlyTerm: 'A source file included in this analysis',
    technicalTerm: 'Analyzed file',
    explanation: 'An analyzed file was included through the project\'s TypeScript configuration. This count does not mean every TypeScript file on disk was analyzed.',
  },
  dependency: {
    id: 'dependency',
    friendlyTerm: 'Uses',
    technicalTerm: 'Dependency',
    explanation: 'A → B means A uses B, so B is a dependency of A. The arrow points from the item containing the reference to what is used.',
  },
  dependent: {
    id: 'dependent',
    friendlyTerm: 'Used by',
    technicalTerm: 'Dependent',
    explanation: 'If B is used by A, A is a dependent of B. Used by lists those sources without reversing the analyzed A → B direction.',
  },
  'filesystem-group': {
    id: 'filesystem-group',
    friendlyTerm: 'Folder organization',
    technicalTerm: 'Filesystem group',
    explanation: 'This label comes only from the first folder in a part\'s root path, such as apps/ or packages/. It is visual organization, not a detected architectural role.',
  },
  'external-module': {
    id: 'external-module',
    friendlyTerm: 'Outside this analyzed system',
    technicalTerm: 'External module',
    explanation: 'The relationship destination did not resolve to an analyzed internal file. This does not prove a remote service, third-party SaaS, or even a confirmed npm package.',
  },
  'contextual-file': {
    id: 'contextual-file',
    friendlyTerm: 'From another part',
    technicalTerm: 'Contextual file',
    explanation: 'This file belongs to another detected part and appears because it has a relationship with the part currently open. Its owner does not change, and it is not contained by the open part.',
  },
  'file-connections': {
    id: 'file-connections',
    friendlyTerm: 'Direct connections around one file',
    technicalTerm: 'File connections',
    explanation: 'The map is temporarily centered on one file and the files or modules directly connected to it. This view does not create a new analyzed unit or change where any file belongs.',
  },
  'connection-anchor': {
    id: 'connection-anchor',
    friendlyTerm: 'The file this view is arranged around',
    technicalTerm: 'Connection anchor',
    explanation: 'The connection anchor remains fixed while this view is open. Selecting another visible item inspects it without replacing the anchor.',
  },
  evidence: {
    id: 'evidence',
    friendlyTerm: 'How BunkerCode knows',
    technicalTerm: 'Evidence',
    explanation: 'Evidence is the configuration, manifest, import or re-export location, and other recorded facts that support a conclusion. It comes from deterministic analysis here, not from an AI-generated explanation.',
  },
  'module-specifier': {
    id: 'module-specifier',
    friendlyTerm: 'The reference text in source code',
    technicalTerm: 'Module specifier',
    explanation: 'This is the text used by an import or re-export to name its destination, such as ./analysis-result.js or ts-morph.',
  },
  confidence: {
    id: 'confidence',
    friendlyTerm: 'How the analyzer classified its support',
    technicalTerm: 'Confidence',
    explanation: 'The contract has exact, inferred, and uncertain categories. The current TypeScript analyzer uses exact for resolved internal targets and explicit unresolved internal or relative intent, and inferred when a reference is classified outside the analyzed files; it does not currently emit uncertain. These labels are not percentages.',
  },
} as const satisfies Record<VocabularyConceptId, VocabularyConcept>;

export type VocabularyPlacement =
  | 'system-map'
  | 'workspace-package'
  | 'relationship-direction'
  | 'external-module'
  | 'contextual-file'
  | 'file-connections'
  | 'evidence';

const vocabularyPlacements = {
  'system-map': ['detected-part', 'workspace', 'workspace-package', 'analyzed-file'],
  'workspace-package': ['workspace-package', 'filesystem-group'],
  'relationship-direction': ['dependency', 'dependent'],
  'external-module': ['external-module'],
  'contextual-file': ['contextual-file'],
  'file-connections': ['file-connections', 'connection-anchor'],
  evidence: ['evidence', 'module-specifier', 'confidence'],
} as const satisfies Record<VocabularyPlacement, readonly VocabularyConceptId[]>;

export function vocabularyForPlacement(placement: VocabularyPlacement): readonly VocabularyConcept[] {
  return vocabularyPlacements[placement].map((conceptId) => explorerVocabulary[conceptId]);
}

export function systemMapVocabularyPlacement(
  hasDetectedWorkspaceStructure: boolean,
): VocabularyPlacement | null {
  return hasDetectedWorkspaceStructure ? 'system-map' : null;
}
