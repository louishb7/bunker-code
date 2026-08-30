import type { ReactNode } from 'react';
import type { ExplorerOrientation, ExplorerNavigationTarget } from './explorer-orientation.js';
import type { ExplorerSearchResult } from './explorer-search.js';

export function ExplorerHeader({
  orientation,
  searchQuery,
  searchResults,
  showSearch,
  showGraphTools,
  showCenterSelected,
  surfaceControl,
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
  showGraphTools: boolean;
  showCenterSelected: boolean;
  surfaceControl: ReactNode;
  onNavigate(target: ExplorerNavigationTarget): void;
  onSearchQueryChange(query: string): void;
  onSelectSearchResult(nodeId: string): void;
  onFitGraph(): void;
  onCenterSelected(): void;
}) {
  return (
    <header className="explorer-header" data-explorer-app-bar>
      <OrientationHeader orientation={orientation} onNavigate={onNavigate} />
      <div className="explorer-header-actions" aria-label="Map tools">
        {surfaceControl}
        {showSearch ? (
          <label className="search-control">
            <span className="search-control-label">Find file</span>
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
        {showGraphTools ? <button className="button-utility" type="button" onClick={onFitGraph}>Fit graph</button> : null}
        {showGraphTools && showCenterSelected ? (
          <button className="button-utility" type="button" onClick={onCenterSelected}>Center selected</button>
        ) : null}
      </div>
    </header>
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
          aria-label={`Structural context: ${orientation.scaleLabel}`}
          data-explorer-scale={orientation.scale}
        >
          <span>Structural context</span>
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
        {orientation.trail.length > 1 ? (
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
        ) : null}
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
