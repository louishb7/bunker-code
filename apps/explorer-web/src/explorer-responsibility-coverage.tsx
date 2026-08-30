import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import { coverageStatusLabel, responsibilityLabel } from './explorer-responsibility-language.js';

export function hasIncompleteResponsibilityCoverage(projection: ExplorerResponsibilityProjection): boolean {
  return projection.coverageSummary.hasPartialCoverage
    || projection.coverageSummary.hasNotEvaluatedCoverage
    || projection.coverageSummary.hasFailures
    || projection.coverageSummary.hasUnsupportedCapabilities;
}

export function ResponsibilityCoverageDisclosure({
  projection,
  context,
}: {
  projection: ExplorerResponsibilityProjection;
  context: 'overview' | 'map';
}) {
  if (!hasIncompleteResponsibilityCoverage(projection)) return null;

  return (
    <details
      className={`responsibility-coverage-notice responsibility-coverage-${context}`}
      data-responsibility-coverage-notice={context === 'map' ? '' : undefined}
      data-overview-responsibility-coverage={context === 'overview' ? '' : undefined}
      data-disclosure={context === 'map' ? 'responsibility-coverage' : 'overview-responsibility-coverage'}
    >
      <summary>Responsibility coverage is incomplete</summary>
      <p>Positive findings describe only the areas this analysis could evaluate.</p>
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
