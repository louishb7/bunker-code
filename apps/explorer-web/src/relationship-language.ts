export const relationshipDirectionKey = 'A → B means A uses B';
export const relationshipDirectionHelp = 'Arrow points to what is used.';

export type RelativeRelationshipRole = 'uses' | 'used-by' | 'unrelated';

export interface DirectedRelationship {
  sourceNodeId: string;
  targetNodeId: string;
}

export function describeRelationship(sourceLabel: string, targetLabel: string): string {
  return `${sourceLabel} uses ${targetLabel}`;
}

export function relationshipRole(
  inspectedNodeId: string | null,
  relationship: DirectedRelationship,
): RelativeRelationshipRole {
  if (relationship.sourceNodeId === inspectedNodeId) {
    return 'uses';
  }

  if (relationship.targetNodeId === inspectedNodeId) {
    return 'used-by';
  }

  return 'unrelated';
}
