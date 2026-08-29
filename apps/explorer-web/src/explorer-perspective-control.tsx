import type { ExplorerPerspective } from './explorer-responsibility-projection.js';

export function ExplorerPerspectiveControl({
  perspective,
  responsibilityAvailable,
  onChange,
}: {
  perspective: ExplorerPerspective;
  responsibilityAvailable: boolean;
  onChange(perspective: ExplorerPerspective): void;
}) {
  return (
    <div className="perspective-control-wrap">
      <div className="perspective-control" role="group" aria-label="Explorer perspective">
        <button
          type="button"
          data-perspective="responsibility"
          aria-pressed={perspective === 'responsibility'}
          disabled={!responsibilityAvailable}
          onClick={() => onChange('responsibility')}
        >Responsibility</button>
        <button
          type="button"
          data-perspective="territory"
          aria-pressed={perspective === 'territory'}
          onClick={() => onChange('territory')}
        >Territory</button>
      </div>
      {!responsibilityAvailable ? (
        <span className="perspective-unavailable">No factual findings are available to compose this perspective.</span>
      ) : null}
    </div>
  );
}
