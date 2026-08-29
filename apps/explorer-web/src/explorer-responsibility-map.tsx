import type { Responsibility, ResponsibilityFinding } from '@bunker-code/contracts';
import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import {
  coverageStatusLabel,
  responsibilityFamilyLabel,
  responsibilityLabel,
  responsibilityLocationLabel,
  responsibilitySubjectKindLabel,
  responsibilitySubjectLabel,
} from './explorer-responsibility-language.js';
import {
  createResponsibilitySpatialModel,
  type ResponsibilityLandmarkPresentation,
} from './explorer-responsibility-spatial-model.js';

export function ResponsibilityMap({
  projection,
  selectedResponsibility,
  selectedFindingId,
  onSelectResponsibility,
  onSelectFinding,
}: {
  projection: ExplorerResponsibilityProjection;
  selectedResponsibility: Responsibility | null;
  selectedFindingId: string | null;
  onSelectResponsibility(responsibility: Responsibility): void;
  onSelectFinding(responsibility: Responsibility, findingId: string): void;
}) {
  const model = createResponsibilitySpatialModel(projection);
  const coverageIncomplete = projection.coverageSummary.hasPartialCoverage
    || projection.coverageSummary.hasNotEvaluatedCoverage
    || projection.coverageSummary.hasFailures
    || projection.coverageSummary.hasUnsupportedCapabilities;

  return (
    <section className="responsibility-map" data-responsibility-map aria-labelledby="responsibility-map-title">
      <header className="responsibility-map-heading">
        <div>
          <p className="eyebrow">What role</p>
          <h2 id="responsibility-map-title">Responsibility map</h2>
          <p>Factual architectural roles, grouped by canonical taxonomy and linked back to structural location.</p>
        </div>
        {coverageIncomplete ? <CoverageDisclosure projection={projection} /> : null}
      </header>
      <div
        className="responsibility-spatial-field"
        data-responsibility-spatial-field
        data-responsibility-composition={model.composition}
      >
        {model.familyRegions.map((region, regionIndex) => (
          <section
            className="responsibility-family-region"
            data-responsibility-family={region.family}
            data-family-position={regionIndex}
            aria-labelledby={`responsibility-family-${region.family}`}
            key={region.family}
          >
            <header>
              <p>Family</p>
              <h3 id={`responsibility-family-${region.family}`}>{responsibilityFamilyLabel(region.family)}</h3>
            </header>
            <div className="responsibility-landmarks">
              {region.responsibilities.map((landmark) => (
                <ResponsibilityLandmark
                  key={landmark.item.responsibility}
                  landmark={landmark}
                  selected={selectedResponsibility === landmark.item.responsibility}
                  selectedFindingId={selectedFindingId}
                  onSelectResponsibility={onSelectResponsibility}
                  onSelectFinding={onSelectFinding}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function ResponsibilityLandmark({
  landmark,
  selected,
  selectedFindingId,
  onSelectResponsibility,
  onSelectFinding,
}: {
  landmark: ResponsibilityLandmarkPresentation;
  selected: boolean;
  selectedFindingId: string | null;
  onSelectResponsibility(responsibility: Responsibility): void;
  onSelectFinding(responsibility: Responsibility, findingId: string): void;
}) {
  const { item } = landmark;

  return (
    <article className="responsibility-landmark" data-selected={selected || undefined}>
      <button
        type="button"
        className="responsibility-landmark-action"
        data-responsibility={item.responsibility}
        aria-pressed={selected}
        onClick={() => onSelectResponsibility(item.responsibility)}
      >
        <span className="responsibility-landmark-kind">Responsibility</span>
        <strong>{responsibilityLabel(item.responsibility)}</strong>
        <span className="responsibility-landmark-counts">
          {countLabel(item.subjectCount, 'subject')} · {territoryCountLabel(item.territoryIds.length)}
        </span>
      </button>
      {selected ? (
        <div className="responsibility-subject-preview" data-responsibility-subject-preview>
          <p>Subject preview</p>
          <ul>
            {landmark.subjectPreviews.map((finding) => (
              <SubjectPreview
                key={finding.id}
                finding={finding}
                selected={selectedFindingId === finding.id}
                onSelect={() => onSelectFinding(item.responsibility, finding.id)}
              />
            ))}
          </ul>
          {landmark.omittedSubjectCount > 0 ? <small>+{landmark.omittedSubjectCount} more in details</small> : null}
        </div>
      ) : null}
    </article>
  );
}

function SubjectPreview({ finding, selected, onSelect }: {
  finding: ResponsibilityFinding;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <li>
      <button
        type="button"
        className="responsibility-subject-preview-action"
        data-responsibility-subject-preview-item={finding.id}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <strong>{responsibilitySubjectLabel(finding.subject)}</strong>
        <span>{responsibilitySubjectKindLabel(finding.subject)} · {responsibilityLocationLabel(finding.subject)}</span>
      </button>
    </li>
  );
}

function CoverageDisclosure({ projection }: { projection: ExplorerResponsibilityProjection }) {
  return (
    <details className="responsibility-coverage-notice" data-responsibility-coverage-notice data-disclosure="responsibility-coverage">
      <summary>Responsibility coverage is incomplete</summary>
      <p>The map shows positive findings from the areas this analysis could evaluate.</p>
      <ul>
        {projection.coverage.map((coverage, index) => (
          <li key={`${coverage.capability}:${coverage.scope.kind}:${index}`}>
            <strong>{responsibilityLabel(coverage.capability)}</strong>
            <span>{coverageStatusLabel(coverage.status)}</span>
            <code>{coverage.status}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function territoryCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'territory' : 'territories'}`;
}
