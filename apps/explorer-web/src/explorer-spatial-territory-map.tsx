import type { ExplorerFileProjectionNode, ExplorerProjection } from './explorer-projection.js';
import type {
  ExplorerTerritory,
  TerritoryPreviewItem,
} from './explorer-territory-projection.js';

type TerritoryPreview = Extract<TerritoryPreviewItem, { kind: 'territory' }>;
type FilePreview = Extract<TerritoryPreviewItem, { kind: 'file' }>;

export type SpatialTerritoryComposition = 'single' | 'pair' | 'triad' | 'field';

export interface SpatialTerritoryRegion {
  territory: ExplorerTerritory;
  previewItems: TerritoryPreviewItem[];
  childTerritoryPreviews: TerritoryPreview[];
  filePreviews: FilePreview[];
}

export interface SpatialTerritoryMapModel {
  scale: 'system' | 'territory';
  composition: SpatialTerritoryComposition;
  currentTerritory: ExplorerTerritory;
  territories: SpatialTerritoryRegion[];
  files: ExplorerFileProjectionNode[];
}

export function createSpatialTerritoryMapModel(
  projection: ExplorerProjection,
  currentTerritory: ExplorerTerritory,
): SpatialTerritoryMapModel {
  if (projection.mode === 'focus') {
    throw new Error('A focused file projection belongs to the relationship graph, not the spatial Territory map.');
  }

  const territories = projection.nodes.flatMap((node) => node.kind === 'territory'
    ? [{
      territory: node.territory,
      previewItems: [...node.territory.previewItems],
      childTerritoryPreviews: node.territory.previewItems.filter((item): item is TerritoryPreview => item.kind === 'territory'),
      filePreviews: node.territory.previewItems.filter((item): item is FilePreview => item.kind === 'file'),
    }]
    : []);

  return {
    scale: currentTerritory.kind === 'system' ? 'system' : 'territory',
    composition: compositionForTerritoryCount(territories.length),
    currentTerritory,
    territories,
    files: projection.nodes.filter((node): node is ExplorerFileProjectionNode => node.kind === 'file'),
  };
}

export function SpatialTerritoryMap({
  model,
  selectedItemId,
  onSelectItem,
  onOpenTerritory,
}: {
  model: SpatialTerritoryMapModel;
  selectedItemId: string | null;
  onSelectItem(itemId: string | null): void;
  onOpenTerritory(territory: ExplorerTerritory): void;
}) {
  const directItemCount = model.territories.length + model.files.length;

  return (
    <section
      className="spatial-territory-map"
      data-spatial-territory-map
      data-map-scale={model.scale}
      data-territory-composition={model.composition}
      data-analyzed-file-count={model.currentTerritory.analyzedFileCount}
      aria-labelledby="spatial-territory-map-title"
    >
      <header className="spatial-map-heading">
        <div>
          <p className="eyebrow">{model.scale === 'system' ? 'System map' : 'Inside this territory'}</p>
          <h2 id="spatial-territory-map-title">{model.currentTerritory.label}</h2>
        </div>
        <p>
          {countLabel(directItemCount, 'direct landmark')}
          <span aria-hidden="true"> · </span>
          {countLabel(model.currentTerritory.analyzedFileCount, 'analyzed file')}
        </p>
      </header>

      <div
        className="spatial-map-surface"
        data-spatial-map-surface
        data-primary-explorer-surface
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelectItem(null);
        }}
      >
        {model.territories.length > 0 ? (
          <div className={`territory-region-field territory-composition-${model.composition}`} aria-label="Direct Territories">
            {model.territories.map((region) => (
              <TerritoryRegion
                key={region.territory.id}
                region={region}
                selected={selectedItemId === region.territory.id}
                onSelect={() => onSelectItem(region.territory.id)}
                onOpen={() => onOpenTerritory(region.territory)}
              />
            ))}
          </div>
        ) : null}

        {model.files.length > 0 ? (
          <section className="file-landmark-field" aria-labelledby="file-landmarks-title">
            <header>
              <p className="eyebrow">Files here</p>
              <h3 id="file-landmarks-title">Direct file landmarks</h3>
            </header>
            <div>
              {model.files.map((file) => (
                <button
                  type="button"
                  className="file-landmark"
                  data-file-landmark={file.id}
                  aria-pressed={selectedItemId === file.id}
                  onClick={() => onSelectItem(file.id)}
                  key={file.id}
                >
                  <span aria-hidden="true" className="file-landmark-mark" />
                  <strong>{file.path.split('/').at(-1) ?? file.path}</strong>
                  <small>{file.path}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function TerritoryRegion({
  region,
  selected,
  onSelect,
  onOpen,
}: {
  region: SpatialTerritoryRegion;
  selected: boolean;
  onSelect(): void;
  onOpen(): void;
}) {
  const { territory, childTerritoryPreviews, filePreviews } = region;

  return (
    <article
      className="territory-region"
      data-territory-region={territory.id}
      data-territory-kind={territory.kind}
    >
      <button
        type="button"
        className="territory-region-select"
        data-territory-select={territory.id}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="territory-region-kind">{territory.kind === 'workspace-package' ? 'Workspace package' : 'Territory'}</span>
        <strong>{territory.label}</strong>
        <span className="territory-region-count">{countLabel(territory.analyzedFileCount, 'file')}</span>
      </button>

      <div className="territory-containment-preview" aria-label={`Direct contents of ${territory.label}`}>
        {childTerritoryPreviews.length > 0 ? (
          <div className="territory-subregion-field">
            {childTerritoryPreviews.map((item) => (
              <span
                className="territory-subregion-preview"
                data-territory-preview-item={item.territoryId}
                data-territory-preview-kind="territory"
                key={item.territoryId}
              >
                <small>Subterritory</small>
                <strong>{item.label}</strong>
              </span>
            ))}
          </div>
        ) : null}
        {filePreviews.length > 0 ? (
          <div className="territory-file-preview-field">
            {filePreviews.map((item) => (
              <span
                className="territory-file-preview"
                data-territory-preview-item={item.fileId}
                data-territory-preview-kind="file"
                key={item.fileId}
              >
                <span aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
        {childTerritoryPreviews.length === 0 && filePreviews.length === 0 ? <span className="territory-preview-empty">No direct contents are materialized at this scale.</span> : null}
        {territory.omittedPreviewItemCount > 0 ? (
          <span className="territory-preview-more">+{territory.omittedPreviewItemCount} more direct items</span>
        ) : null}
      </div>

      {selected && territory.isDrillable ? (
        <button type="button" className="territory-region-open" data-territory-open={territory.id} onClick={onOpen}>
          Open <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </article>
  );
}

function compositionForTerritoryCount(territoryCount: number): SpatialTerritoryComposition {
  if (territoryCount === 1) return 'single';
  if (territoryCount === 2) return 'pair';
  if (territoryCount === 3) return 'triad';
  return 'field';
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
