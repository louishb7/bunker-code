import type { ProjectGraphEdge } from '@bunker-code/graph-engine';
import type { FileExploration, FileExplorationRelation } from './file-exploration.js';
import type { ExplorerTerritory } from './explorer-territory-projection.js';
import { describeRelationship } from './relationship-language.js';
import { VocabularyHelp } from './vocabulary-help.js';

export function TerritoryDetails({ territory, onOpen }: { territory: ExplorerTerritory; onOpen(): void }) {
  const isSystem = territory.kind === 'system';

  return (
    <article className="territory-exploration" aria-labelledby="selected-territory-title">
      <header className="territory-identity">
        <p className="eyebrow">{isSystem ? 'Analyzed system' : 'Territory'}</p>
        <h2 id="selected-territory-title">{territory.label}</h2>
        <p>{countLabel(territory.analyzedFileCount, 'analyzed file')} · {countLabel(territory.directChildTerritoryCount, 'child territory')}</p>
      </header>
      <section className="territory-location" aria-labelledby="territory-location-title">
        <h3 id="territory-location-title">Structural path</h3>
        <p>{territory.structuralPath.join('/')}</p>
      </section>
      <section className="territory-next-action" aria-labelledby="territory-next-action-title">
        <p className="detail-section-label">Next action</p>
        <h3 id="territory-next-action-title">Open territory</h3>
        <div className="details-actions"><button className="primary-action" type="button" onClick={onOpen}>Open territory</button></div>
        <p>See this territory’s direct child territories and files.</p>
      </section>
      <details className="part-disclosure" data-disclosure="territory-technical-details">
        <summary>Technical details</summary>
        <dl>
          <div><dt>Kind</dt><dd>{territory.kind}</dd></div>
          <div><dt>Structural path</dt><dd>{territory.normalizedStructuralPath}</dd></div>
        </dl>
      </details>
      {territory.evidence && territory.evidence.length > 0 ? (
        <details className="part-disclosure" data-disclosure="territory-evidence">
          <summary>How BunkerCode knows</summary>
          <ul className="technical-surface">
            {territory.evidence.map((evidence) => <li key={`${evidence.kind}-${'path' in evidence ? evidence.path : evidence.pattern}`}>
              {territoryEvidenceLabel(evidence)}
            </li>)}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function territoryEvidenceLabel(evidence: NonNullable<ExplorerTerritory['evidence']>[number]): string {
  if (evidence.kind === 'workspace-configuration') return `Workspace configuration: ${evidence.path}`;
  if (evidence.kind === 'workspace-pattern') return `Workspace pattern: ${evidence.pattern}`;
  return `Package manifest: ${evidence.path}`;
}

export function FileDetails({ exploration, onFocus, onExpand }: {
  exploration: FileExploration;
  onFocus(): void;
  onExpand(): void;
}) {
  return (
    <article className={`file-exploration file-exploration-${exploration.kind}`} aria-labelledby="selected-file-title">
      <header className="file-identity">
        <p className="eyebrow">{exploration.anchor?.isSelected ? 'Connection anchor' : 'Selected item'}</p>
        <h2 id="selected-file-title">{exploration.presentationLabel}</h2>
      </header>
      <section className="file-context" aria-labelledby="file-context-title">
        <h3 id="file-context-title">{exploration.contextLabel}</h3>
        {exploration.contextExplanation ? <p>{exploration.contextExplanation}</p> : null}
        {exploration.location ? <div className="file-location"><strong>Located in</strong><span>{exploration.location}</span></div> : null}
      </section>
      {exploration.anchor ? <section className="file-anchor-context" aria-label={`Connection anchor: ${exploration.anchor.label}`}>
        <strong>Connection anchor</strong><span>{exploration.anchor.label}</span>
        <VocabularyHelp placement="file-connections" label="Learn about this view" />
      </section> : null}
      <div className="file-relationships" aria-label="File connections">
        <p className="detail-section-label">Relationships</p>
        <VocabularyHelp placement="relationship-direction" label="Learn Uses and Used by" />
        <FileRelationList title="Uses" emptyMessage={exploration.usesEmptyMessage} relations={exploration.uses} />
        <FileRelationList title="Used by" emptyMessage={exploration.usedByEmptyMessage} relations={exploration.usedBy} />
      </div>
      <section className="file-next-action" aria-labelledby="file-next-action-title">
        <p className="detail-section-label">Next action</p><h3 id="file-next-action-title">Investigate this item</h3>
        {exploration.canFocus ? <div className="file-action-option"><button className="primary-action" type="button" onClick={onFocus}>Show direct connections</button></div> : null}
        {exploration.canExpand ? <div className="file-action-option"><button className="secondary-action" type="button" onClick={onExpand}>Show one more step</button></div> : null}
        {exploration.actionUnavailableExplanation ? <p className="part-state-explanation">{exploration.actionUnavailableExplanation}</p> : null}
      </section>
      <details className="part-disclosure file-disclosure" data-disclosure="file-technical-details"><summary>Technical details</summary><dl>
        <div><dt>Full ID</dt><dd>{exploration.technicalIdentity}</dd></div><div><dt>Kind</dt><dd>{exploration.technicalKind}</dd></div>
        <div><dt>Uses occurrences</dt><dd>{exploration.rawUsesCount}</dd></div><div><dt>Used by occurrences</dt><dd>{exploration.rawUsedByCount}</dd></div>
      </dl></details>
      <details className="part-disclosure file-disclosure" data-disclosure="file-evidence"><summary>How BunkerCode knows</summary><FileEvidence exploration={exploration} /></details>
    </article>
  );
}

function FileRelationList({ title, emptyMessage, relations }: { title: string; emptyMessage: string; relations: FileExplorationRelation[] }) {
  return <section className="relation-list"><h3>{title}</h3>{relations.length === 0 ? <p>{emptyMessage}</p> : <ul>{relations.map((relation) => (
    <li key={`${relation.sourceNodeId}->${relation.targetNodeId}`} aria-label={describeRelationship(relation.sourceLabel, relation.targetLabel)}>
      <strong>{relation.relatedLabel}</strong><span>{countLabel(relation.occurrences.length, 'relationship')}</span>
    </li>))}</ul>}</section>;
}

function FileEvidence({ exploration }: { exploration: FileExploration }) {
  return <div className="file-evidence technical-surface"><VocabularyHelp placement="evidence" label="Learn about this evidence" />
    <FileEvidenceGroup title="Uses evidence" relations={exploration.uses} />
    <FileEvidenceGroup title="Used by evidence" relations={exploration.usedBy} />
  </div>;
}

function FileEvidenceGroup({ title, relations }: { title: string; relations: FileExplorationRelation[] }) {
  return <section><h3>{title}</h3>{relations.length === 0 ? <p>No supporting occurrences for this direction.</p> : <ul>{relations.map((relation) => (
    <li key={`${relation.sourceNodeId}->${relation.targetNodeId}`}><strong>{describeRelationship(relation.sourceLabel, relation.targetLabel)}</strong>
      <ol>{relation.occurrences.map((occurrence) => <li key={occurrence.id}><span>{relationLabel(occurrence)}</span></li>)}</ol>
    </li>))}</ul>}</section>;
}

function relationLabel(edge: ProjectGraphEdge): string {
  const location = edge.evidence.location;
  return `${edge.moduleSpecifier} at ${location.filePath}:${location.line}:${location.column} (${edge.confidence})`;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
