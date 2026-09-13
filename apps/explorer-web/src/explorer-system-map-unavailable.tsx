export function ExplorerSystemMapUnavailable({
  projectLabel,
  onExploreStructure,
}: {
  projectLabel: string;
  onExploreStructure(): void;
}) {
  return (
    <section className="system-map system-map-unavailable" data-system-map data-system-map-status="source-territory-unavailable">
      <header className="system-map-heading">
        <div>
          <p className="eyebrow">System Map · structure inside src</p>
          <h2>{projectLabel}</h2>
        </div>
        <dl className="system-map-summary" aria-label="System Map factual summary">
          <div><dt>Visual items</dt><dd>0</dd></div>
          <div><dt>Directed relations</dt><dd>0</dd></div>
          <div><dt>File dependencies represented</dt><dd>0</dd></div>
        </dl>
      </header>
      <div className="system-map-empty-region" data-primary-explorer-surface>
        <div className="system-map-empty">
          <p className="eyebrow">System Map boundary</p>
          <h2>No <code>src</code> Territory was observed</h2>
          <p>This map only represents observed structure directly inside <code>src</code>. No alternative area is inferred.</p>
          <button type="button" onClick={onExploreStructure}>Explore all Territories</button>
        </div>
      </div>
    </section>
  );
}
