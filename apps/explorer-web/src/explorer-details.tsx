import type { PackageDependency, ProjectGraphEdge } from '@bunker-code/graph-engine';
import type { WorkspacePackage } from '@bunker-code/contracts';
import type { ExplorerWorkspacePackageProjectionNode } from './explorer-projection.js';
import {
  createPackageExploration,
  type PackageExplorationRelation,
} from './package-exploration.js';
import type {
  FileExploration,
  FileExplorationRelation,
} from './file-exploration.js';
import { describeRelationship } from './relationship-language.js';
import { VocabularyHelp } from './vocabulary-help.js';

export function WorkspacePackageDetails({
  part,
  systemParts,
  packageDependencies,
  onOpen,
}: {
  part: ExplorerWorkspacePackageProjectionNode;
  systemParts: ExplorerWorkspacePackageProjectionNode[];
  packageDependencies: PackageDependency[];
  onOpen(): void;
}) {
  const exploration = createPackageExploration(part, systemParts, packageDependencies);

  return (
    <article className="part-exploration" aria-labelledby="selected-part-title">
      <header className="part-identity">
        <p className="eyebrow">Part of this system</p>
        <h2 id="selected-part-title">{exploration.presentationLabel}</h2>
        <p className="part-file-summary">{countLabel(exploration.fileCount, 'analyzed file')}</p>
        {exploration.zeroFileExplanation ? <p className="part-state-explanation">{exploration.zeroFileExplanation}</p> : null}
        <VocabularyHelp placement="workspace-package" label="Learn about this part" />
      </header>

      <section className="part-location" aria-labelledby="part-location-title">
        <h3 id="part-location-title">Located in</h3>
        <p>{exploration.location}</p>
      </section>

      <div className="part-relationships" aria-label="Connections to other parts">
        <p className="detail-section-label">Relationships</p>
        {exploration.isolatedExplanation ? (
          <section className="relation-list relation-list-empty" aria-labelledby="part-connections-title">
            <h3 id="part-connections-title">Connections</h3>
            <p className="part-state-explanation">{exploration.isolatedExplanation}</p>
          </section>
        ) : (
          <>
            <VocabularyHelp placement="relationship-direction" label="Learn Uses and Used by" />
            <PackageRelationList
              title="Uses"
              emptyMessage="No detected connections from this part to other parts."
              relations={exploration.uses}
            />
            <PackageRelationList
              title="Used by"
              emptyMessage="No other detected parts use this part."
              relations={exploration.usedBy}
            />
          </>
        )}
      </div>

      <section className="part-next-action" aria-labelledby="part-next-action-title">
        <p className="detail-section-label">Next action</p>
        <h3 id="part-next-action-title">Explore this part</h3>
        {exploration.canOpenFiles ? (
          <>
            <div className="details-actions"><button className="primary-action" type="button" onClick={onOpen}>Open files</button></div>
            <p>See the analyzed files that make up this part.</p>
          </>
        ) : (
          <p className="part-state-explanation">There are no analyzed files to open for this part.</p>
        )}
      </section>

      <details className="part-disclosure" data-disclosure="technical-details">
        <summary>Technical details</summary>
        <dl>
          <div><dt>Workspace package</dt><dd>{exploration.technicalIdentity}</dd></div>
          <div><dt>Root path</dt><dd>{exploration.location}</dd></div>
          <div><dt>Filesystem group</dt><dd>{exploration.filesystemGroup === '.' ? './' : `${exploration.filesystemGroup}/`}</dd></div>
        </dl>
      </details>

      <details className="part-disclosure" data-disclosure="evidence">
        <summary>How BunkerCode knows</summary>
        <PackageEvidence
          rootPath={exploration.location}
          evidence={exploration.evidence}
          relationships={[...exploration.uses, ...exploration.usedBy]}
        />
      </details>
    </article>
  );
}

export function FileDetails({
  exploration,
  onFocus,
  onExpand,
}: {
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
        {exploration.kind === 'external-module' ? <p className="file-secondary-type">External module</p> : null}
        {exploration.ownerPartLabel ? <p className="file-owner-part">{exploration.ownerPartLabel}</p> : null}
        {exploration.contextExplanation ? <p>{exploration.contextExplanation}</p> : null}
        {exploration.kind === 'external-module' ? (
          <VocabularyHelp placement="external-module" label="Why is this here?" />
        ) : exploration.kind === 'contextual-file' ? (
          <VocabularyHelp placement="contextual-file" label="Why is this here?" />
        ) : null}
        {exploration.location ? (
          <div className="file-location">
            <strong>Located in</strong>
            <span>{exploration.location}</span>
          </div>
        ) : null}
      </section>

      {exploration.anchor ? (
        <section className="file-anchor-context" aria-label={`Connection anchor: ${exploration.anchor.label}`}>
          <div className="anchor-marker" aria-hidden="true"><span /></div>
          {!exploration.anchor.isSelected ? (
            <>
              <strong>Connection anchor</strong>
              <span>{exploration.anchor.label}</span>
            </>
          ) : null}
          <p>{exploration.anchor.isSelected
            ? 'The map is arranged around this file and its direct connections.'
            : 'This remains the file around which the map is arranged. The selected item is being inspected without changing the anchor.'}</p>
          <VocabularyHelp placement="file-connections" label="Learn about this view" />
        </section>
      ) : null}

      <div className="file-relationships" aria-label="File connections">
        <p className="detail-section-label">Relationships</p>
        <VocabularyHelp placement="relationship-direction" label="Learn Uses and Used by" />
        <FileRelationList title="Uses" emptyMessage={exploration.usesEmptyMessage} relations={exploration.uses} />
        <FileRelationList title="Used by" emptyMessage={exploration.usedByEmptyMessage} relations={exploration.usedBy} />
      </div>

      <section className="file-next-action" aria-labelledby="file-next-action-title">
        <p className="detail-section-label">Next action</p>
        <h3 id="file-next-action-title">Investigate this item</h3>
        {exploration.canFocus ? (
          <div className="file-action-option">
            <button className="primary-action" type="button" onClick={onFocus}>Show direct connections</button>
            <p>Reorganize the map around this file, what it uses, and what uses it.</p>
          </div>
        ) : null}
        {exploration.canExpand ? (
          <div className="file-action-option file-action-secondary">
            <button className="secondary-action" type="button" onClick={onExpand}>Show one more step</button>
            <p>Reveal one additional direct neighborhood without changing the connection anchor.</p>
          </div>
        ) : null}
        {exploration.actionUnavailableExplanation ? (
          <p className="part-state-explanation">{exploration.actionUnavailableExplanation}</p>
        ) : null}
      </section>

      <details className="part-disclosure file-disclosure" data-disclosure="file-technical-details">
        <summary>Technical details</summary>
        <dl>
          <div><dt>Full ID</dt><dd>{exploration.technicalIdentity}</dd></div>
          <div><dt>Kind</dt><dd>{exploration.technicalKind}</dd></div>
          <div><dt>Uses occurrences</dt><dd>{exploration.rawUsesCount}</dd></div>
          <div><dt>Used by occurrences</dt><dd>{exploration.rawUsedByCount}</dd></div>
        </dl>
      </details>

      <details className="part-disclosure file-disclosure" data-disclosure="file-evidence">
        <summary>How BunkerCode knows</summary>
        <FileEvidence exploration={exploration} />
      </details>
    </article>
  );
}

function PackageEvidence({
  rootPath,
  evidence,
  relationships,
}: {
  rootPath: string;
  evidence: WorkspacePackage['evidence'];
  relationships: PackageExplorationRelation[];
}) {
  return (
    <div className="package-evidence technical-surface">
      <VocabularyHelp placement="evidence" label="Learn about this evidence" />
      <section aria-labelledby="detection-evidence-title">
        <h3 id="detection-evidence-title">Detection evidence</h3>
        <p><strong>Detected root:</strong> {rootPath}</p>
        <ul>
          {evidence.map((item) => <li key={evidenceLabel(item)}>{evidenceLabel(item)}</li>)}
        </ul>
      </section>
      <section aria-labelledby="relationship-evidence-title">
        <h3 id="relationship-evidence-title">Relationship evidence</h3>
        {relationships.length === 0 ? <p className="muted">No package relationships were detected for this part.</p> : (
          <ul className="relationship-proof-list">
            {relationships.map((relationship) => (
              <li key={relationship.id}>
                <strong>{describeRelationship(relationship.sourceLabel, relationship.targetLabel)}</strong>
                <span>{countLabel(relationship.fileDependencies.length, 'supporting file relationship')}</span>
                <ul>
                  {relationship.fileDependencies.map((edge) => (
                    <li key={edge.id}>
                      <span>{describeRelationship(edge.sourceNodeId, edge.targetNodeId)}</span>
                      <span>{relationLabel(edge)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PackageRelationList({
  title,
  emptyMessage,
  relations,
}: {
  title: string;
  emptyMessage: string;
  relations: PackageExplorationRelation[];
}) {
  const headingId = `part-${title.toLowerCase().replaceAll(' ', '-')}-title`;
  const directionClass = title === 'Uses' ? 'relation-list-uses' : 'relation-list-used-by';

  return (
    <section className={`relation-list ${directionClass}`} aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {relations.length === 0 ? <p className="part-state-explanation">{emptyMessage}</p> : (
        <ul>
          {relations.map((relation) => (
            <li key={relation.id} aria-label={describeRelationship(relation.sourceLabel, relation.targetLabel)}>
              <strong>{relation.relatedLabel}</strong>
              <span className="relation-evidence">{countLabel(relation.fileDependencies.length, 'supporting file relationship')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FileRelationList({
  title,
  emptyMessage,
  relations,
}: {
  title: string;
  emptyMessage: string;
  relations: FileExplorationRelation[];
}) {
  const directionClass = title === 'Uses' ? 'relation-list-uses' : 'relation-list-used-by';

  return (
    <section className={`relation-list ${directionClass}`}>
      <h3>{title}</h3>
      {relations.length === 0 ? <p className="part-state-explanation">{emptyMessage}</p> : (
        <ul>
          {relations.map((relation) => (
            <li
              key={`${relation.sourceNodeId}->${relation.targetNodeId}`}
              aria-label={describeRelationship(relation.sourceLabel, relation.targetLabel)}
            >
              <strong>{relation.relatedLabel}</strong>
              <span className="file-relation-context">{relation.relatedContextLabel}</span>
              <span className="relation-evidence">{countLabel(relation.occurrences.length, 'relationship')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FileEvidence({ exploration }: { exploration: FileExploration }) {
  return (
    <div className="file-evidence technical-surface">
      <p>Exact analyzed occurrences supporting the relationships shown above.</p>
      <VocabularyHelp placement="evidence" label="Learn about this evidence" />
      <FileEvidenceGroup title="Uses evidence" relations={exploration.uses} />
      <FileEvidenceGroup title="Used by evidence" relations={exploration.usedBy} />
    </div>
  );
}

function FileEvidenceGroup({ title, relations }: { title: string; relations: FileExplorationRelation[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {relations.length === 0 ? <p className="muted">No supporting occurrences for this direction.</p> : (
        <ul className="file-evidence-relations">
          {relations.map((relation) => (
            <li key={`${relation.sourceNodeId}->${relation.targetNodeId}`}>
              <strong>{describeRelationship(relation.sourceLabel, relation.targetLabel)}</strong>
              <span>{countLabel(relation.occurrences.length, 'occurrence')}</span>
              <ol>
                {relation.occurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    <dl>
                      <div><dt>Module specifier</dt><dd>{occurrence.moduleSpecifier}</dd></div>
                      <div><dt>Source ID</dt><dd>{occurrence.sourceNodeId}</dd></div>
                      <div><dt>Target ID</dt><dd>{occurrence.targetNodeId}</dd></div>
                      <div><dt>Evidence file</dt><dd>{occurrence.evidence.location.filePath}</dd></div>
                      <div><dt>Line</dt><dd>{occurrence.evidence.location.line}</dd></div>
                      <div><dt>Column</dt><dd>{occurrence.evidence.location.column}</dd></div>
                      <div><dt>Confidence</dt><dd>{occurrence.confidence}</dd></div>
                    </dl>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function evidenceLabel(evidence: WorkspacePackage['evidence'][number]): string {
  if (evidence.kind === 'workspace-pattern') {
    return `Workspace pattern: ${evidence.pattern}`;
  }

  return evidence.kind === 'workspace-configuration'
    ? `Workspace configuration: ${evidence.path}`
    : `Package manifest: ${evidence.path}`;
}

function relationLabel(edge: ProjectGraphEdge): string {
  const location = edge.evidence.location;
  return `${edge.moduleSpecifier} at ${location.filePath}:${location.line}:${location.column} (${edge.confidence})`;
}
