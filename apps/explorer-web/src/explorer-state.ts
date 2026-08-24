import type { ProjectStructure } from '@bunker-code/graph-engine';

export interface SystemExplorerState {
  scope: 'system';
  selectedPackageId: string | null;
}

export interface FileOverviewExplorerState {
  scope: 'file-overview';
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  expandedNodeIds: ReadonlySet<string>;
}

export interface WorkspacePackageExplorerState {
  scope: 'workspace-package';
  packageId: string;
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  expandedNodeIds: ReadonlySet<string>;
}

export type ExplorerState = SystemExplorerState | FileOverviewExplorerState | WorkspacePackageExplorerState;

export function createInitialExplorerState(structure: ProjectStructure): ExplorerState {
  return structure.packages.length > 0
    ? { scope: 'system', selectedPackageId: null }
    : createFileOverviewExplorerState();
}

export function createFileOverviewExplorerState(): FileOverviewExplorerState {
  return {
    scope: 'file-overview',
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set(),
  };
}

export function selectWorkspacePackage(
  state: SystemExplorerState,
  packageId: string | null,
): SystemExplorerState {
  return { ...state, selectedPackageId: packageId };
}

export function openSelectedWorkspacePackage(
  state: SystemExplorerState,
): WorkspacePackageExplorerState | null {
  if (!state.selectedPackageId) {
    return null;
  }

  return {
    scope: 'workspace-package',
    packageId: state.selectedPackageId,
    selectedNodeId: null,
    focusedNodeId: null,
    expandedNodeIds: new Set(),
  };
}

export function returnToSystem(state: WorkspacePackageExplorerState): SystemExplorerState {
  return { scope: 'system', selectedPackageId: state.packageId };
}

export function selectFileNode<TState extends FileOverviewExplorerState | WorkspacePackageExplorerState>(
  state: TState,
  nodeId: string | null,
): TState {
  return { ...state, selectedNodeId: nodeId };
}
