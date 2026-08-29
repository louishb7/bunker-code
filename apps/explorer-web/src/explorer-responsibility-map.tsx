import type { Responsibility } from '@bunker-code/contracts';
import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import {
  coverageStatusLabel,
  responsibilityFamilyLabel,
  responsibilityLabel,
} from './explorer-responsibility-language.js';

export function ResponsibilityMap({
  projection,
  selectedResponsibility,
  onSelectResponsibility,
}: {
  projection: ExplorerResponsibilityProjection;
  selectedResponsibility: Responsibility | null;
  onSelectResponsibility(responsibility: Responsibility): void;
}) {
  const coverageIncomplete = projection.coverageSummary.hasPartialCoverage
    || projection.coverageSummary.hasNotEvaluatedCoverage
    || projection.coverageSummary.hasFailures
    || projection.coverageSummary.hasUnsupportedCapabilities;

  return (
    <section className="responsibility-map" data-responsibility-map aria-labelledby="responsibility-map-title">
      <header className="responsibility-map-heading">
        <p className="eyebrow">What role</p>
        <h2 id="responsibility-map-title">Responsibility map</h2>
        <p>Explore factual responsibilities, then locate their subjects in the system’s structural Territories.</p>
      </header>
      {coverageIncomplete ? (
        <aside className="responsibility-coverage-notice" data-responsibility-coverage-notice>
          <strong>Responsibility coverage is incomplete</strong>
          <span>The map shows positive findings from the areas this analysis could evaluate.</span>
          <details data-disclosure="responsibility-coverage">
            <summary>Review coverage</summary>
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
        </aside>
      ) : null}
      <div className="responsibility-regions">
        {projection.groups.map((group) => (
          <section
            className="responsibility-family-region"
            data-responsibility-family={group.family}
            aria-labelledby={`responsibility-family-${group.family}`}
            key={group.family}
          >
            <header>
              <p>Family</p>
              <h3 id={`responsibility-family-${group.family}`}>{responsibilityFamilyLabel(group.family)}</h3>
            </header>
            <div className="responsibility-landmarks">
              {group.responsibilities.map((responsibility) => (
                <button
                  type="button"
                  className="responsibility-landmark"
                  data-responsibility={responsibility.responsibility}
                  aria-pressed={selectedResponsibility === responsibility.responsibility}
                  onClick={() => onSelectResponsibility(responsibility.responsibility)}
                  key={responsibility.responsibility}
                >
                  <strong>{responsibilityLabel(responsibility.responsibility)}</strong>
                  <span>{countLabel(responsibility.subjectCount, 'subject')} · {countLabel(responsibility.territoryIds.length, 'territory')}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
