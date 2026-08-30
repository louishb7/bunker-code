import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import { responsibilityFamilyLabel, responsibilityLabel } from './explorer-responsibility-language.js';
import { ResponsibilityCoverageDisclosure } from './explorer-responsibility-coverage.js';
import type { SpatialTerritoryMapModel } from './explorer-spatial-territory-map.js';

export function ExplorerSystemOverview({
  projectLabel,
  territoryModel,
  responsibilities,
  responsibilityAvailable,
  onExploreResponsibilities,
  onExploreStructure,
}: {
  projectLabel: string;
  territoryModel: SpatialTerritoryMapModel;
  responsibilities: ExplorerResponsibilityProjection;
  responsibilityAvailable: boolean;
  onExploreResponsibilities(): void;
  onExploreStructure(): void;
}) {
  const hasResponsibilityFindings = responsibilities.coverageSummary.hasFindings;

  return (
    <section className="system-overview" data-system-overview aria-labelledby="system-overview-title">
      <header className="system-overview-heading">
        <p className="eyebrow">Orient</p>
        <h2 id="system-overview-title">{projectLabel}</h2>
        <span>System overview</span>
      </header>

      <div className="system-overview-field" data-primary-explorer-surface>
        <section className="overview-region overview-where" aria-labelledby="overview-where-title">
          <header>
            <div><p className="eyebrow">Where</p><h3 id="overview-where-title">System structure</h3></div>
            <span>{countLabel(territoryModel.territories.length, 'direct Territory')}</span>
          </header>
          <div className="overview-territory-field">
            {territoryModel.territories.map((region) => (
              <article data-overview-territory={region.territory.id} key={region.territory.id}>
                <strong>{region.territory.label}</strong>
                {region.childTerritoryPreviews.length > 0 ? (
                  <ul>
                    {region.childTerritoryPreviews.slice(0, 3).map((child) => <li key={child.territoryId}>{child.label}</li>)}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
          <button type="button" className="overview-depth-action" onClick={onExploreStructure}>Explore structure <span aria-hidden="true">→</span></button>
        </section>

        <section className="overview-region overview-responsibility" aria-labelledby="overview-responsibility-title">
          <header>
            <div><p className="eyebrow">What role</p><h3 id="overview-responsibility-title">Architectural Responsibility</h3></div>
            {hasResponsibilityFindings ? <span>{countLabel(responsibilities.coverageSummary.findingCount, 'factual finding')}</span> : null}
          </header>
          {hasResponsibilityFindings ? (
            <div className="overview-responsibility-field">
              {responsibilities.groups.map((group) => (
                <section data-overview-family={group.family} key={group.family}>
                  <h4>{responsibilityFamilyLabel(group.family)}</h4>
                  <ul>
                    {group.responsibilities.map((item) => (
                      <li data-overview-responsibility={item.responsibility} key={item.responsibility}>
                        {responsibilityLabel(item.responsibility)}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="overview-responsibility-unavailable" data-overview-responsibility-unavailable>
              <strong>No supported factual responsibility findings are available for this analysis.</strong>
              <p>This does not establish that the system has no architectural responsibilities.</p>
            </div>
          )}
          {!responsibilityAvailable && hasResponsibilityFindings ? (
            <p className="overview-responsibility-limit">The available findings are not sufficient to compose the Responsibility lens.</p>
          ) : null}
          <ResponsibilityCoverageDisclosure projection={responsibilities} context="overview" />
          {responsibilityAvailable ? (
            <button type="button" className="overview-depth-action" onClick={onExploreResponsibilities}>Explore responsibilities <span aria-hidden="true">→</span></button>
          ) : (
            <button type="button" className="overview-depth-action" onClick={onExploreStructure}>Explore structure <span aria-hidden="true">→</span></button>
          )}
        </section>
      </div>
    </section>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
