import type { Responsibility, ResponsibilityFinding } from '@bunker-code/contracts';
import {
  responsibilityFamilyLabel,
  responsibilityLabel,
  responsibilityLocationLabel,
  responsibilitySubjectKindLabel,
  responsibilitySubjectLabel,
} from './explorer-responsibility-language.js';
import {
  resolveOwningTerritory,
  type ExplorerResponsibilityProjection,
} from './explorer-responsibility-projection.js';
import type { ExplorerTerritoryProjection } from './explorer-territory-projection.js';

export function ResponsibilityDetails({
  projection,
  territories,
  selectedResponsibility,
  selectedFindingId,
  onSelectFinding,
  onBackToResponsibility,
  onLocateFinding,
}: {
  projection: ExplorerResponsibilityProjection;
  territories: ExplorerTerritoryProjection;
  selectedResponsibility: Responsibility | null;
  selectedFindingId: string | null;
  onSelectFinding(responsibility: Responsibility, findingId: string): void;
  onBackToResponsibility(): void;
  onLocateFinding(finding: ResponsibilityFinding): void;
}) {
  const selection = projection.groups.flatMap((group) => group.responsibilities.map((item) => ({ family: group.family, item })))
    .find(({ item }) => item.responsibility === selectedResponsibility);
  const finding = selection?.item.findings.find((candidate) => candidate.id === selectedFindingId);

  if (!selection) {
    return (
      <div className="empty-details responsibility-empty-details">
        <div className="empty-state-marker" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">Responsibility perspective</p>
        <h2>Select a responsibility</h2>
        <p>Inspect its factual subjects and the Territories where those subjects are located.</p>
      </div>
    );
  }

  if (finding) {
    return (
      <article className="responsibility-subject-details" data-selected-responsibility-subject aria-labelledby="responsibility-subject-title">
        <button type="button" className="back-action responsibility-back-action" onClick={onBackToResponsibility}>← Back to responsibility</button>
        <header>
          <p className="eyebrow">{responsibilityLabel(selection.item.responsibility)}</p>
          <h2 id="responsibility-subject-title">{responsibilitySubjectLabel(finding.subject)}</h2>
          <p>{responsibilitySubjectKindLabel(finding.subject)}</p>
        </header>
        <SubjectLocation finding={finding} territories={territories} />
        <section className="responsibility-next-action" aria-labelledby="responsibility-locate-title">
          <p className="detail-section-label">Where</p>
          <h3 id="responsibility-locate-title">Locate this subject</h3>
          <button className="primary-action" type="button" onClick={() => onLocateFinding(finding)}>Locate in Territory</button>
        </section>
        <details className="part-disclosure responsibility-evidence" data-disclosure="responsibility-evidence">
          <summary>How BunkerCode knows</summary>
          <div className="technical-surface responsibility-evidence-body">
            <dl>
              <div><dt>Confidence</dt><dd>{finding.confidence}</dd></div>
              <div><dt>Detector</dt><dd>{finding.provenance.detector.id}@{finding.provenance.detector.version}</dd></div>
              <div><dt>Rule</dt><dd>{finding.provenance.ruleId}@{finding.provenance.ruleVersion}</dd></div>
            </dl>
            <h3>Evidence</h3>
            <ul>
              {finding.evidence.map((evidence) => (
                <li key={evidence.id}>
                  <strong>{evidence.technology.displayName}: {evidence.signal}</strong>
                  <span>{evidence.kind} · {evidence.location.filePath}:{evidence.location.line}:{evidence.location.column}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </article>
    );
  }

  return (
    <article className="responsibility-details" data-responsibility-details aria-labelledby="selected-responsibility-title">
      <header>
        <p className="eyebrow">{responsibilityFamilyLabel(selection.family)}</p>
        <h2 id="selected-responsibility-title">{responsibilityLabel(selection.item.responsibility)}</h2>
        <p>{countLabel(selection.item.subjectCount, 'subject')} · {countLabel(selection.item.territoryIds.length, 'territory')}</p>
      </header>
      <section className="responsibility-territory-summary" aria-labelledby="responsibility-territories-title">
        <p className="detail-section-label">Where</p>
        <h3 id="responsibility-territories-title">Territories involved</h3>
        <ul>
          {selection.item.territoryIds.map((territoryId) => {
            const territory = territories.territoriesById.get(territoryId);
            return <li key={territoryId}>{territory?.normalizedStructuralPath ?? territoryId}</li>;
          })}
        </ul>
      </section>
      <section className="responsibility-subject-list" aria-labelledby="responsibility-subjects-title">
        <p className="detail-section-label">Subjects</p>
        <h3 id="responsibility-subjects-title">Factual findings</h3>
        <ul>
          {selection.item.findings.map((itemFinding) => (
            <li key={itemFinding.id}>
              <button
                type="button"
                data-responsibility-subject={itemFinding.id}
                onClick={() => onSelectFinding(selection.item.responsibility, itemFinding.id)}
              >
                <strong>{responsibilitySubjectLabel(itemFinding.subject)}</strong>
                <span>{responsibilitySubjectKindLabel(itemFinding.subject)}</span>
                <small>{responsibilityLocationLabel(itemFinding.subject)}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function SubjectLocation({ finding, territories }: { finding: ResponsibilityFinding; territories: ExplorerTerritoryProjection }) {
  const territory = resolveOwningTerritory(finding.subject.fileId, territories);

  return (
    <section className="responsibility-subject-location" aria-labelledby="responsibility-subject-location-title">
      <p className="detail-section-label">Located in</p>
      <h3 id="responsibility-subject-location-title">{territory.label}</h3>
      <p>{territory.normalizedStructuralPath}</p>
      <code>{responsibilityLocationLabel(finding.subject)}</code>
    </section>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
