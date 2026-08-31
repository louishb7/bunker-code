import type { ResponsibilityEvaluationScope } from '@bunker-code/contracts';
import type {
  ExplorerComprehensionProjection,
  ExplorerFactualRelation,
} from './explorer-comprehension-projection.js';
import { responsibilityLabel } from './explorer-responsibility-language.js';

export function ExplorerSystemOverview({
  projectLabel,
  comprehension,
  responsibilityAvailable,
  onExploreResponsibilities,
  onExploreStructure,
}: {
  projectLabel: string;
  comprehension: ExplorerComprehensionProjection;
  responsibilityAvailable: boolean;
  onExploreResponsibilities(): void;
  onExploreStructure(): void;
}) {
  const unknown = comprehension.uncertainty;
  const uncertaintyCount = unknown.architecturalMeaningUndetermined.length
    + unknown.responsibilityCoverage.length
    + unknown.unresolvedDependencies.length;

  return (
    <section className="system-overview" data-system-overview aria-labelledby="system-overview-title">
      <header className="system-overview-heading">
        <p className="eyebrow">Orientation reference</p>
        <h2 id="system-overview-title">{projectLabel}</h2>
        <p>Existing evidence organized by what is observable, evidenced, related, and still unknown.</p>
      </header>

      <div className="comprehension-reference" data-primary-explorer-surface>
        <section data-comprehension-section="observable-parts" aria-labelledby="observable-parts-title">
          <header><p className="eyebrow">Orient</p><h3 id="observable-parts-title">Observable parts</h3></header>
          <ul>
            {comprehension.observableParts.map((part) => (
              <li data-observable-part={part.id} key={part.id}>
                <strong>{part.label}</strong>
                <span>{part.kind === 'file' ? 'Analyzed file' : part.territoryKind === 'workspace-package' ? 'Workspace package' : 'Structural Territory'}</span>
                <code>{part.anchor.path}</code>
              </li>
            ))}
          </ul>
        </section>

        <section data-comprehension-section="known-responsibilities" aria-labelledby="known-responsibilities-title">
          <header><p className="eyebrow">Interpret</p><h3 id="known-responsibilities-title">Known Responsibilities</h3></header>
          {comprehension.knownResponsibilities.length > 0 ? (
            <ul>{comprehension.knownResponsibilities.map((finding) => (
              <li data-known-responsibility={finding.id} key={finding.id}>
                <strong>{responsibilityLabel(finding.responsibility)}</strong>
                <span>{finding.anchor.location.filePath}:{finding.anchor.location.line}</span>
              </li>
            ))}</ul>
          ) : (
            <p data-overview-responsibility-unavailable>
              No factual Responsibility finding is available. This does not establish that the system has no architectural responsibilities.
            </p>
          )}
          {responsibilityAvailable ? <button type="button" onClick={onExploreResponsibilities}>Explore responsibilities →</button> : null}
        </section>

        <section data-comprehension-section="factual-relations" aria-labelledby="factual-relations-title">
          <header><p className="eyebrow">Relate</p><h3 id="factual-relations-title">Factual relations</h3></header>
          {comprehension.factualRelations.length > 0 ? (
            <ul>{comprehension.factualRelations.map((relation) => (
              <FactualRelation relation={relation} key={relation.id} />
            ))}</ul>
          ) : <p>No factual relation is available at this scale.</p>}
        </section>

        <section data-comprehension-section="uncertainty" aria-labelledby="uncertainty-title">
          <header><p className="eyebrow">Uncertainty</p><h3 id="uncertainty-title">What remains unknown</h3></header>
          <p>{uncertaintyCount} explicit knowledge limit{uncertaintyCount === 1 ? '' : 's'} at this scale.</p>
          <ul>
            {unknown.architecturalMeaningUndetermined.map((item) => (
              <li data-architectural-meaning-undetermined={item.observablePartId} key={`meaning:${item.observablePartId}`}>
                The architectural meaning of <code>{item.anchor.path}</code> has not been established. Responsibility findings remain localized evidence.
              </li>
            ))}
            {unknown.responsibilityCoverage.map(({ coverage }) => (
              <li data-responsibility-coverage={coverage.status} key={`coverage:${coverage.capability}:${coverageScopeKey(coverage.scope)}`}>
                {responsibilityLabel(coverage.capability)} coverage: <strong>{coverage.status}</strong>.
              </li>
            ))}
            {unknown.unresolvedDependencies.map((dependency) => (
              <li data-unresolved-dependency={dependency.id} key={dependency.id}>
                Could not resolve <code>{dependency.moduleSpecifier}</code> from <code>{dependency.sourceAnchor.path}</code>: {dependency.reason}.
              </li>
            ))}
          </ul>
        </section>

        <footer className="comprehension-actions">
          <button type="button" onClick={onExploreStructure}>Explore Territory →</button>
        </footer>
      </div>
    </section>
  );
}

function FactualRelation({ relation }: { relation: ExplorerFactualRelation }) {
  if (relation.kind === 'package-dependency') {
    return (
      <li data-factual-relation="package-dependency" data-system-connection={relation.id}>
        <strong>{relation.source.label}</strong> uses <strong>{relation.target.label}</strong> through {relation.fileDependencyCount} file-level dependenc{relation.fileDependencyCount === 1 ? 'y' : 'ies'}.
      </li>
    );
  }

  if (relation.kind === 'external-module-touchpoint') {
    return (
      <li data-factual-relation="external-module-touchpoint" data-external-module={relation.moduleSpecifier}>
        {relation.sourceAnchors.length} analyzed file{relation.sourceAnchors.length === 1 ? '' : 's'} import <code>{relation.moduleSpecifier}</code>; this is an external-module touchpoint, not a proved integration.
      </li>
    );
  }

  if (relation.kind === 'dependency-isolation') {
    return (
      <li data-factual-relation="dependency-isolation">
        No dependency edge is reported for <code>{relation.fileAnchor.path}</code>.
      </li>
    );
  }

  return (
    <li data-factual-relation="dependency-cycle">
      A factual dependency cycle crosses {relation.fileAnchors.length} file references.
    </li>
  );
}

function coverageScopeKey(scope: ResponsibilityEvaluationScope): string {
  if (scope.kind === 'project') return 'project';
  if (scope.kind === 'file') return `file:${scope.fileId}`;
  return `subject:${scope.fileId}:${scope.subjectId}`;
}
