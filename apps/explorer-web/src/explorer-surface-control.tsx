import type { ExplorerSurface } from './explorer-view-state.js';

export function ExplorerSurfaceControl({
  surface,
  responsibilityAvailable,
  onChange,
}: {
  surface: ExplorerSurface;
  responsibilityAvailable: boolean;
  onChange(surface: ExplorerSurface): void;
}) {
  return (
    <div className="surface-control-wrap">
      <div className="surface-control" role="group" aria-label="Explorer view">
        <SurfaceButton surface="overview" current={surface} onChange={onChange}>Overview</SurfaceButton>
        <SurfaceButton
          surface="responsibility"
          current={surface}
          disabled={!responsibilityAvailable}
          describedBy={!responsibilityAvailable ? 'responsibility-unavailable-explanation' : undefined}
          onChange={onChange}
        >Responsibility</SurfaceButton>
        <SurfaceButton surface="territory" current={surface} onChange={onChange}>Territory</SurfaceButton>
      </div>
      {!responsibilityAvailable ? (
        <span id="responsibility-unavailable-explanation" className="surface-unavailable-explanation">
          Responsibility is unavailable because this analysis has no qualifying factual responsibility findings.
        </span>
      ) : null}
    </div>
  );
}

function SurfaceButton({
  surface,
  current,
  disabled = false,
  describedBy,
  onChange,
  children,
}: {
  surface: ExplorerSurface;
  current: ExplorerSurface;
  disabled?: boolean;
  describedBy?: string;
  onChange(surface: ExplorerSurface): void;
  children: string;
}) {
  return (
    <button
      type="button"
      data-surface={surface}
      data-perspective={surface === 'overview' ? undefined : surface}
      aria-pressed={current === surface}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(surface)}
    >{children}</button>
  );
}
