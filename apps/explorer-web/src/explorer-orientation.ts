import { getWorkspacePackage } from '@bunker-code/graph-engine';
import type { ProjectGraph, ProjectStructure } from '@bunker-code/graph-engine';
import type { WorkspacePackage } from '@bunker-code/contracts';
import { fileNameFromPath } from './explorer-search.js';
import type { ExplorerState, FileOverviewExplorerState, WorkspacePackageExplorerState } from './explorer-state.js';

export type ExplorerNavigationTarget = 'system' | 'files';

export interface ExplorerTrailItem {
  id: string;
  label: string;
  target?: ExplorerNavigationTarget;
}

export interface ExplorerBackAction {
  label: string;
  target: ExplorerNavigationTarget;
}

export interface ExplorerOrientation {
  projectLabel: string;
  scale: 'system-map' | 'part-files' | 'project-files' | 'file-connections';
  scaleLabel: 'System map' | 'Part files' | 'Project files' | 'File connections';
  trail: ExplorerTrailItem[];
  backAction?: ExplorerBackAction;
  focusedFileLabel?: string;
}

export function createExplorerOrientation(
  state: ExplorerState,
  projectLabel: string,
  graph: ProjectGraph,
  structure: ProjectStructure,
): ExplorerOrientation {
  const normalizedProjectLabel = projectLabel.trim() || 'Analyzed project';

  if (state.scope === 'system') {
    return {
      projectLabel: normalizedProjectLabel,
      scale: 'system-map',
      scaleLabel: 'System map',
      trail: [{ id: 'project', label: normalizedProjectLabel }],
    };
  }

  if (state.scope === 'file-overview') {
    return fileOrientation(state, normalizedProjectLabel, graph);
  }

  const workspacePackage = getWorkspacePackage(structure, state.packageId);
  const packageLabel = workspacePackageLabel(workspacePackage);
  return packageOrientation(state, normalizedProjectLabel, packageLabel, workspacePackageShortLabel(workspacePackage), graph);
}

function fileOrientation(
  state: FileOverviewExplorerState,
  projectLabel: string,
  graph: ProjectGraph,
): ExplorerOrientation {
  if (!state.focusedNodeId) {
    return {
      projectLabel,
      scale: 'project-files',
      scaleLabel: 'Project files',
      trail: [{ id: 'project', label: projectLabel }],
    };
  }

  const focusedFileLabel = graphFileLabel(graph, state.focusedNodeId);
  return {
    projectLabel,
    scale: 'file-connections',
    scaleLabel: 'File connections',
    focusedFileLabel,
    backAction: { label: 'Back to project files', target: 'files' },
    trail: [
      { id: 'project', label: projectLabel, target: 'files' },
      { id: state.focusedNodeId, label: focusedFileLabel },
    ],
  };
}

function packageOrientation(
  state: WorkspacePackageExplorerState,
  projectLabel: string,
  packageLabel: string,
  shortPackageLabel: string,
  graph: ProjectGraph,
): ExplorerOrientation {
  if (!state.focusedNodeId) {
    return {
      projectLabel,
      scale: 'part-files',
      scaleLabel: 'Part files',
      backAction: { label: 'Back to system map', target: 'system' },
      trail: [
        { id: 'project', label: projectLabel, target: 'system' },
        { id: state.packageId, label: packageLabel },
      ],
    };
  }

  const focusedFileLabel = graphFileLabel(graph, state.focusedNodeId);
  return {
    projectLabel,
    scale: 'file-connections',
    scaleLabel: 'File connections',
    focusedFileLabel,
    backAction: { label: `Back to ${shortPackageLabel} files`, target: 'files' },
    trail: [
      { id: 'project', label: projectLabel, target: 'system' },
      { id: state.packageId, label: packageLabel, target: 'files' },
      { id: state.focusedNodeId, label: focusedFileLabel },
    ],
  };
}

function graphFileLabel(graph: ProjectGraph, nodeId: string): string {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  return node?.kind === 'file' ? fileNameFromPath(node.path) : fileNameFromPath(nodeId);
}

function workspacePackageLabel(workspacePackage: WorkspacePackage | undefined): string {
  return workspacePackage?.name ?? workspacePackage?.rootPath ?? 'Unknown workspace package';
}

function workspacePackageShortLabel(workspacePackage: WorkspacePackage | undefined): string {
  const label = workspacePackageLabel(workspacePackage);
  return label.split('/').at(-1) || label;
}
