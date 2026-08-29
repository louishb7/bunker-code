import type { ExplorerOrientation, ExplorerNavigationTarget } from './explorer-orientation.js';
import type { ExplorerRootSummary } from './explorer-projection.js';
import type { ExplorerSearchResult } from './explorer-search.js';
import {
  relationshipDirectionHelp,
  relationshipDirectionKey,
} from './relationship-language.js';
import { systemMapVocabularyPlacement } from './explorer-vocabulary.js';
import { VocabularyHelp } from './vocabulary-help.js';

export function ExplorerHeader({
  orientation,
  searchQuery,
  searchResults,
  showSearch,
  showCenterSelected,
  onNavigate,
  onSearchQueryChange,
  onSelectSearchResult,
  onFitGraph,
  onCenterSelected,
}: {
  orientation: ExplorerOrientation;
  searchQuery: string;
  searchResults: ExplorerSearchResult[];
  showSearch: boolean;
  showCenterSelected: boolean;
  onNavigate(target: ExplorerNavigationTarget): void;
  onSearchQueryChange(query: string): void;
  onSelectSearchResult(nodeId: string): void;
  onFitGraph(): void;
  onCenterSelected(): void;
}) {
  return (
    <header className="explorer-header">
      <OrientationHeader orientation={orientation} onNavigate={onNavigate} />
      <div className="explorer-header-actions" aria-label="Map tools">
        {showSearch ? (
          <label className="search-control">
            <span>Find file</span>
            <input
              aria-label="Find file"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Path or file name"
            />
            {searchQuery.trim() ? (
              <SearchResults results={searchResults} onSelect={onSelectSearchResult} />
            ) : null}
          </label>
        ) : null}
        <button className="button-utility" type="button" onClick={onFitGraph}>Fit graph</button>
        {showCenterSelected ? (
          <button className="button-utility" type="button" onClick={onCenterSelected}>Center selected</button>
        ) : null}
      </div>
    </header>
  );
}

export function SystemMapSummary({ summary }: { summary: ExplorerRootSummary }) {
  const vocabularyPlacement = systemMapVocabularyPlacement(summary.directTerritoryCount > 0);

  return (
    <section className="system-map-summary" aria-labelledby="system-map-summary-title">
      <div className="system-summary-introduction">
        <p className="eyebrow">System at a glance</p>
        <h2 id="system-map-summary-title" className="system-summary-metrics">
          <span data-system-territory-count={summary.directTerritoryCount}>{countLabel(summary.directTerritoryCount, 'direct territory')}</span>
          <span data-analyzed-file-count={summary.analyzedFileCount}>{countLabel(summary.analyzedFileCount, 'analyzed file')}</span>
        </h2>
        <p>Select a territory to inspect its direct structural children and files.</p>
        {vocabularyPlacement ? <VocabularyHelp placement={vocabularyPlacement} label="Learn about system structure" /> : null}
      </div>
      <div className="relationship-key" aria-label={`Relationship direction: ${relationshipDirectionKey}. ${relationshipDirectionHelp}`}>
        <p className="summary-section-label">Relationship direction</p>
        <p className="relationship-equation"><span aria-hidden="true">A → B</span><span>means A uses B</span></p>
        <small>{relationshipDirectionHelp}</small>
        <VocabularyHelp placement="relationship-direction" label="Learn Uses and Used by" />
      </div>
    </section>
  );
}

export function ExplorerEmptyDetails({
  orientation,
  visibleNodeCount,
}: {
  orientation: ExplorerOrientation;
  visibleNodeCount: number;
}) {
  return (
    <div className="empty-details">
      <div className="empty-state-marker" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow">{orientation.scaleLabel}</p>
      <h2>{orientation.focusedFileLabel
        ? `Direct connections for ${orientation.focusedFileLabel}`
        : orientation.scale === 'root'
          ? 'Select a territory to inspect it'
          : `${visibleNodeCount} visible nodes`}</h2>
      <p>{orientation.scale === 'root'
        ? 'Each territory exposes its direct structural children and analyzed files.'
        : orientation.scale === 'file-connections'
          ? 'Select any visible item to inspect it. Use Back to return to the current territory.'
          : 'Find a file, select it, then show its direct structural connections.'}</p>
      {orientation.scale === 'file-connections' ? (
        <VocabularyHelp placement="file-connections" label="Learn about this view" />
      ) : null}
    </div>
  );
}

export function StatusScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="status-screen">
      <div className="status-screen-mark" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow">BunkerCode Explorer</p>
      <h1>{title}</h1>
      <p>{message}</p>
    </main>
  );
}

function OrientationHeader({
  orientation,
  onNavigate,
}: {
  orientation: ExplorerOrientation;
  onNavigate(target: ExplorerNavigationTarget): void;
}) {
  const backAction = orientation.backAction;

  return (
    <div className="explorer-orientation">
      <div className="orientation-identity">
        <p className="product-wordmark"><span aria-hidden="true">B</span>BunkerCode</p>
        <p
          className="scale-indicator"
          aria-label={`Current view: ${orientation.scaleLabel}`}
          data-explorer-scale={orientation.scale}
        >
          <span>Current view</span>
          <strong>{orientation.scaleLabel}</strong>
        </p>
      </div>
      <div className="orientation-heading">
        <h1>{orientation.projectLabel}</h1>
      </div>
      <div className="orientation-navigation">
        {backAction ? (
          <button
            type="button"
            className="back-action"
            aria-label={backAction.label}
            onClick={() => onNavigate(backAction.target)}
          >
            <span aria-hidden="true">←</span>
            {backAction.label}
          </button>
        ) : null}
        <nav className="breadcrumb" aria-label="Explorer location">
          <ol>
            {orientation.trail.map((item, index) => (
              <li key={item.id}>
                {index > 0 ? <span className="breadcrumb-separator" aria-hidden="true">/</span> : null}
                {item.target ? (
                  <button type="button" onClick={() => {
                    if (item.target) onNavigate(item.target);
                  }}>{item.label}</button>
                ) : (
                  <span aria-current="page">{item.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );
}

function SearchResults({
  results,
  onSelect,
}: {
  results: ExplorerSearchResult[];
  onSelect(nodeId: string): void;
}) {
  if (results.length === 0) {
    return <p className="search-empty" role="status">No internal files match this search.</p>;
  }

  return (
    <ul className="search-results" aria-label="File search results">
      {results.map((result) => (
        <li key={result.nodeId}>
          <button type="button" data-search-result={result.nodeId} onClick={() => onSelect(result.nodeId)}>
            <strong>{result.fileName}</strong>
            <span>{result.path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
