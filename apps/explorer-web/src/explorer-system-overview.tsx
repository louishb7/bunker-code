import type { ExplorerResponsibilityProjection } from './explorer-responsibility-projection.js';
import { responsibilityFamilyLabel, responsibilityLabel } from './explorer-responsibility-language.js';
import { ResponsibilityCoverageDisclosure } from './explorer-responsibility-coverage.js';
import type { SpatialTerritoryMapModel } from './explorer-spatial-territory-map.js';
import type { ExplorerSystemOrientationProjection } from './explorer-system-orientation.js';

export function ExplorerSystemOverview({
  projectLabel,
  territoryModel,
  systemOrientation,
  responsibilities,
  responsibilityAvailable,
  onExploreResponsibilities,
  onExploreStructure,
}: {
  projectLabel: string;
  territoryModel: SpatialTerritoryMapModel;
  systemOrientation: ExplorerSystemOrientationProjection;
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

        <section className="overview-region overview-connections" data-system-connections aria-labelledby="overview-connections-title">
          <header>
            <div><p className="eyebrow">System connections</p><h3 id="overview-connections-title">Structural dependency directions</h3></div>
          </header>
          {systemOrientation.packageConnections.length > 0 ? (
            <ol className="overview-connection-list">
              {systemOrientation.packageConnections.map((connection) => (
                <li data-system-connection={connection.id} key={connection.id}>
                  <strong>{connection.source.label}</strong>
                  <span aria-hidden="true">→</span>
                  <strong>{connection.target.label}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="overview-orientation-empty">No cross-package dependency directions were reported for this analysis.</p>
          )}
          {systemOrientation.externalModules.length > 0 ? (
            <details className="overview-external-usage" data-external-module-usage>
              <summary>Imported external modules</summary>
              <ul>
                {systemOrientation.externalModules.map((usage) => (
                  <li data-external-module={usage.moduleSpecifier} key={usage.moduleSpecifier}>
                    <code>{usage.moduleSpecifier}</code>
                    <span> imported by {countLabel(usage.sourceFileIds.length, 'analyzed file')}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
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

        {systemOrientation.cycles.length > 0 || systemOrientation.isolatedFiles.length > 0 || systemOrientation.unresolvedDependencies.length > 0 ? (
          <section className="overview-region overview-observations" data-structural-observations aria-labelledby="overview-observations-title">
            <header><div><p className="eyebrow">Observations</p><h3 id="overview-observations-title">Structural facts to inspect</h3></div></header>
            <ul>
              {systemOrientation.cycles.map((cycle) => <li data-structural-observation="cycle" key={cycle.fileIds.join('|')}>A dependency cycle includes {countLabel(cycle.fileIds.length, 'file')}.</li>)}
              {systemOrientation.isolatedFiles.map((file) => <li data-structural-observation="isolated-file" key={file.id}>No dependency edges were reported for <code>{file.path}</code>.</li>)}
              {systemOrientation.unresolvedDependencies.map((dependency) => <li data-structural-observation="unresolved-dependency" key={dependency.id}>Could not resolve <code>{dependency.moduleSpecifier}</code> from <code>{dependency.sourceFileId}</code>.</li>)}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
