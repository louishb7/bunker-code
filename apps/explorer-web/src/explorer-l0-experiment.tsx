import { useState } from 'react';
import type { ResponsibilityEvaluationScope } from '@bunker-code/contracts';
import type { ExplorerFactualRelation } from './explorer-comprehension-projection.js';
import type {
  ExplorerL0ExperimentModel,
  ExplorerL0ExperimentVariant,
} from './explorer-l0-experiment-model.js';
import { responsibilityLabel } from './explorer-responsibility-language.js';
import type { ExplorerStructuralEvidenceNode } from './explorer-structural-evidence-distribution.js';

export function ExplorerL0Experiment({
  projectLabel,
  variant,
  model,
}: {
  projectLabel: string;
  variant: ExplorerL0ExperimentVariant;
  model: ExplorerL0ExperimentModel;
}) {
  return (
    <section
      className="l0-experiment"
      data-l0-experiment={variant}
      data-factual-input={model.factSetKey}
      aria-labelledby="l0-experiment-title"
    >
      <header className="l0-experiment-heading">
        <div>
          <p className="eyebrow">Controlled L0 experiment</p>
          <h2 id="l0-experiment-title">{projectLabel}</h2>
          <p>Same factual input. Experimental organization only. No architectural role is inferred.</p>
        </div>
        <nav aria-label="L0 experiment variants">
          <a aria-current={variant === 'structure-first' ? 'page' : undefined} href="?l0-experiment=structure-first">A · Structure-first</a>
          <a aria-current={variant === 'evidence-first' ? 'page' : undefined} href="?l0-experiment=evidence-first">B · Evidence-first</a>
        </nav>
      </header>

      <div className="l0-experiment-sequence" data-primary-explorer-surface>
        {variant === 'structure-first'
          ? <StructureFirst model={model} />
          : <EvidenceFirst model={model} />}
        <SharedSecondaryEvidence model={model} />
      </div>
    </section>
  );
}

function StructureFirst({ model }: { model: ExplorerL0ExperimentModel }) {
  const [territoryId, setTerritoryId] = useState(model.structureRoot.territoryId);
  const node = findStructuralNode(model.structureRoot, territoryId) ?? model.structureRoot;
  const parent = parentStructuralNode(model.structureRoot, node.territoryId);

  return (
    <section className="l0-experiment-primary" data-l0-structure-first data-focused-territory={node.territoryId}>
      <header>
        <p className="eyebrow">Structure-first progressive</p>
        <h3>What structural regions exist here?</h3>
        <p>Territories follow factual containment. Finding volume does not establish architectural meaning.</p>
      </header>
      <div className="l0-structural-focus">
        <div>
          {parent ? <button type="button" className="l0-back" onClick={() => setTerritoryId(parent.territoryId)}>← Back one structural level</button> : null}
          <strong>{node.label}</strong>
          <code>{node.path}</code>
        </div>
        <EvidenceVolume node={node} />
      </div>
      {node.children.length > 0 ? (
        <ol className="l0-structural-children">
          {node.children.map((child) => (
            <li key={child.territoryId} data-l0-structural-child={child.territoryId}>
              <button type="button" onClick={() => setTerritoryId(child.territoryId)}>
                <span><strong>{child.label}</strong><code>{child.path}</code></span>
                <EvidenceVolume node={child} />
                <small>Architectural meaning not established.</small>
              </button>
            </li>
          ))}
        </ol>
      ) : <p>No direct child Territory is available at this structural scale.</p>}
    </section>
  );
}

function EvidenceFirst({ model }: { model: ExplorerL0ExperimentModel }) {
  const [selectedResponsibility, setSelectedResponsibility] = useState<string | null>(null);
  const selected = model.evidenceGroups.find((group) => group.responsibility === selectedResponsibility);

  return (
    <section className="l0-experiment-primary" data-l0-evidence-first data-selected-responsibility={selectedResponsibility ?? ''}>
      <header>
        <p className="eyebrow">Evidence-first located</p>
        <h3>What technical behaviors can we prove?</h3>
        <p>Only positive factual findings are shown. Counts are raw detector output volume, not normalized weight.</p>
      </header>
      {model.evidenceGroups.length > 0 ? (
        <>
          <ol className="l0-evidence-groups">
            {model.evidenceGroups.map((group) => (
              <li key={group.responsibility} data-l0-responsibility={group.responsibility}>
                <button type="button" onClick={() => setSelectedResponsibility(group.responsibility)}>
                  <strong>{responsibilityLabel(group.responsibility)}</strong>
                  <span>{group.findingCount} factual finding{group.findingCount === 1 ? '' : 's'}</span>
                </button>
              </li>
            ))}
          </ol>
          {selected ? (
            <section className="l0-evidence-locations" data-l0-evidence-locations={selected.responsibility}>
              <h4>{responsibilityLabel(selected.responsibility)} is located in</h4>
              <ul>{selected.locations.map((location) => (
                <li key={location.territoryId} data-l0-evidence-location={location.territoryId}>
                  <strong>{location.label}</strong><code>{location.path}</code>
                  <span>{location.findingCount} factual finding{location.findingCount === 1 ? '' : 's'} in this structural region</span>
                </li>
              ))}</ul>
            </section>
          ) : <p className="l0-explicit-choice">Select a Responsibility to inspect its factual structural locations.</p>}
        </>
      ) : (
        <section className="l0-zero-evidence" data-l0-zero-responsibility>
          <p>No factual Responsibility findings are available for this analysis.</p>
          <p>This does not establish that the system has no architectural responsibilities.</p>
          <h4>System-level structural orientation remains available</h4>
          <ul>{model.systemParts.map((part) => (
            <li key={part.territoryId} data-l0-fallback-part={part.territoryId}>
              <strong>{part.label}</strong><code>{part.path}</code>
            </li>
          ))}</ul>
        </section>
      )}
    </section>
  );
}

function EvidenceVolume({ node }: { node: ExplorerStructuralEvidenceNode }) {
  return (
    <div className="l0-evidence-volume">
      <span>{node.localEvidence.findingCount} local factual finding{node.localEvidence.findingCount === 1 ? '' : 's'}</span>
      <span>{node.subtreeEvidence.findingCount} factual finding{node.subtreeEvidence.findingCount === 1 ? '' : 's'} in subtree</span>
      {node.subtreeEvidence.responsibilityFindingCounts.length > 0 ? (
        <ul>{node.subtreeEvidence.responsibilityFindingCounts.map((count) => (
          <li key={count.responsibility}>{responsibilityLabel(count.responsibility)} {count.findingCount}</li>
        ))}</ul>
      ) : null}
    </div>
  );
}

function SharedSecondaryEvidence({ model }: { model: ExplorerL0ExperimentModel }) {
  const external = model.relations.filter((relation) => relation.kind === 'external-module-touchpoint');
  const directRelations = model.relations.filter((relation) => relation.kind !== 'external-module-touchpoint');
  const uncertaintyCount = model.uncertainty.architecturalMeaningUndetermined.length
    + model.uncertainty.responsibilityCoverage.length
    + model.uncertainty.unresolvedDependencies.length;

  return (
    <aside className="l0-shared-evidence" data-l0-shared-evidence>
      <section data-l0-relations>
        <h3>Factual relations</h3>
        {directRelations.length > 0 ? <ul>{directRelations.map((relation) => <ExperimentRelation key={relation.id} relation={relation} />)}</ul> : null}
        {external.length > 0 ? (
          <details>
            <summary>{external.length} external-module touchpoint{external.length === 1 ? '' : 's'}</summary>
            <ul>{external.map((relation) => <ExperimentRelation key={relation.id} relation={relation} />)}</ul>
          </details>
        ) : null}
        {model.relations.length === 0 ? <p>No factual relation is available at this scale.</p> : null}
      </section>
      <section data-l0-uncertainty>
        <h3>Uncertainty</h3>
        <p>{uncertaintyCount} explicit knowledge limit{uncertaintyCount === 1 ? '' : 's'}.</p>
        <details>
          <summary>Inspect knowledge limits</summary>
          <ul>
            {model.uncertainty.architecturalMeaningUndetermined.map((item) => (
              <li key={`meaning:${item.observablePartId}`}>Architectural meaning not established for <code>{item.anchor.path}</code>.</li>
            ))}
            {model.uncertainty.responsibilityCoverage.map(({ coverage }) => (
              <li data-responsibility-coverage={coverage.status} key={`coverage:${coverage.capability}:${coverageScopeKey(coverage.scope)}`}>
                {responsibilityLabel(coverage.capability)} coverage: {coverage.status}.
              </li>
            ))}
            {model.uncertainty.unresolvedDependencies.map((dependency) => (
              <li key={dependency.id}>Unresolved <code>{dependency.moduleSpecifier}</code> from <code>{dependency.sourceAnchor.path}</code>.</li>
            ))}
          </ul>
        </details>
      </section>
    </aside>
  );
}

function ExperimentRelation({ relation }: { relation: ExplorerFactualRelation }) {
  if (relation.kind === 'package-dependency') {
    return <li data-l0-relation={relation.kind}>{relation.source.label} uses {relation.target.label} through {relation.fileDependencyCount} file-level dependenc{relation.fileDependencyCount === 1 ? 'y' : 'ies'}.</li>;
  }
  if (relation.kind === 'external-module-touchpoint') {
    return <li data-l0-relation={relation.kind}><code>{relation.moduleSpecifier}</code> imported by {relation.sourceAnchors.length} analyzed file{relation.sourceAnchors.length === 1 ? '' : 's'}; not a proved integration.</li>;
  }
  if (relation.kind === 'dependency-isolation') {
    return <li data-l0-relation={relation.kind}>No dependency edge is reported for <code>{relation.fileAnchor.path}</code>.</li>;
  }
  return <li data-l0-relation={relation.kind}>A factual dependency cycle crosses {relation.fileAnchors.length} file references.</li>;
}

function findStructuralNode(root: ExplorerStructuralEvidenceNode, territoryId: string): ExplorerStructuralEvidenceNode | null {
  if (root.territoryId === territoryId) return root;
  for (const child of root.children) {
    const found = findStructuralNode(child, territoryId);
    if (found) return found;
  }
  return null;
}

function parentStructuralNode(root: ExplorerStructuralEvidenceNode, territoryId: string): ExplorerStructuralEvidenceNode | null {
  if (root.children.some((child) => child.territoryId === territoryId)) return root;
  for (const child of root.children) {
    const parent = parentStructuralNode(child, territoryId);
    if (parent) return parent;
  }
  return null;
}

function coverageScopeKey(scope: ResponsibilityEvaluationScope): string {
  if (scope.kind === 'project') return 'project';
  if (scope.kind === 'file') return `file:${scope.fileId}`;
  return `subject:${scope.fileId}:${scope.subjectId}`;
}
