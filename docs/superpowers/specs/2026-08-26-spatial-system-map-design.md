# Spatial System Map Design

## Status

Approved design consolidated from the Phase 5 human decisions. This document
defines the architecture and behavioral contracts for a future implementation;
it does not implement the Explorer rewrite.

## Product principle

> Map your system before changing it.

The Spatial System Map makes a system investigable as territory before showing
the routes that cross it:

```text
CONTAINMENT / STRUCTURE DEFINE THE TERRITORY.
DEPENDENCIES ARE ROUTES OVER THAT TERRITORY.
```

`ProjectStructure` remains the factual containment model. `ProjectGraph`
remains the factual dependency model. They are never merged into a hybrid
graph.

“Complete map” means that every relevant part of the analyzed system is
reachable through progressive, multiscale exploration. It does not mean
rendering every territory, file, and relationship simultaneously.

## Current Explorer boundary

The current code implements this pipeline:

```text
generated snapshot
  → ExplorerRuntime
  → ExplorerState
  → ExplorerProjection
  → ExplorerElements / visual adapter
  → attention decoration
  → React Flow
  → ELK
  → rendered Explorer
```

The relevant current modules are:

- `apps/explorer-web/scripts/generate-snapshot.ts` creates a snapshot from
  `AnalysisResult`, `ProjectGraph`, `ProjectStructure`, and aggregated package
  dependencies.
- `apps/explorer-web/src/explorer-runtime.ts` validates snapshots and rebuilds
  the graph and structure.
- `apps/explorer-web/src/explorer-state.ts` stores the current system,
  workspace-package, or file-overview state.
- `apps/explorer-web/src/explorer-projection.ts` selects presentation nodes and
  dependency edges.
- `apps/explorer-web/src/explorer-model.ts` adapts projection data to React
  Flow elements and invokes ELK.
- `apps/explorer-web/src/explorer-attention.ts` applies anchor, selection, and
  relationship attention roles.
- `apps/explorer-web/src/explorer-graph.tsx` renders React Flow nodes, edges,
  background, and controls.
- `apps/explorer-web/src/main.tsx` coordinates runtime, state, projection,
  layout, attention, navigation, and the details panel.

The Phase 5 design changes the Explorer presentation and navigation layers. It
does not change analyzer contracts, graph-engine facts, or snapshot schema.

## Architectural layers

The responsibilities are intentionally separate:

```text
ProjectStructure
  = factual containment

ExplorerTerritoryProjection
  = useful structural hierarchy for presentation

ProjectGraph
  = factual dependency relationships

Explorer route aggregation
  = dependency presentation for the current semantic scale

ExplorerLocation
  = semantic navigation state

Per-scale layout
  = spatial positioning

VisualPresentationPolicy / LOD
  = rendered information density
```

No layer assumes the responsibility of the next layer. Coordinates remain
presentation data and never enter analytical contracts.

## Decision 1 — transparent structural chain compression

`ExplorerTerritoryProjection` may make an intermediate directory transparent
when, at that level of the factual structural tree:

- it has exactly one relevant directory child; and
- it has zero direct analyzed-file children.

“File” means only an item represented by `analysis.files` and by factual
`ProjectStructure` containment. README files, `.gitignore`, arbitrary files
found on disk, unanalyzed configuration files, and files outside
`analysis.files` do not affect this rule.

The rule is purely structural. It does not inspect:

- directory names such as `src`, `app`, `backend`, or `api`;
- framework names or conventions;
- dependency counts or centrality;
- importance scores;
- filename heuristics;
- architectural roles.

Compression applies recursively, including:

- below `analysis-root:.`;
- inside any projected territory;
- inside the structural area associated with a workspace package; and
- at every semantic scale, not only the first map.

For example, the factual chain:

```text
System
└── backend
    └── src
        ├── auth
        ├── cases
        └── users
```

may be presented as:

```text
System
├── auth
├── cases
└── users
```

The full structural path remains available as:

```text
System → backend → src → auth
```

Compression never mutates `ProjectStructure`.

### Workspace package precedence

`WorkspacePackage` and `DirectoryStructuralUnit` may factually share a
`rootPath`. When that happens:

- `WorkspacePackage` is the visible territorial identity;
- `DirectoryStructuralUnit` remains available for factual filesystem traversal;
- the projection emits one visible territory, not two duplicates;
- no synthetic `WorkspacePackage → DirectoryStructuralUnit` relationship is
  created; and
- `ProjectStructure` is unchanged.

`analysis-root:.` always remains the conceptual `System` identity. A root
workspace package with `rootPath: '.'` never replaces it.

## Decision 2 — territories with a structural preview

The initial map renders territories with a limited, deterministic structural
summary. It does not render every real child node inside a territory at the
same semantic scale.

```text
preview item ≠ rendered child node
```

Preview items are cartographic summaries. They are not React Flow children and
are not independent nodes at that scale.

### Preview selection

Preview items are derived from the immediately visible children of the
projected territory hierarchy *after* transparent structural compression.
They may represent either:

- another projected territory; or
- an analyzed file.

Selection is structural and deterministic. Canonical ordering is:

```text
normalizedStructuralPath → stableId
```

The policy must not use centrality, dependency count, filename importance,
controller/service heuristics, framework semantics, scores, or discovery order.

### Preview limit

For the system semantic scale:

```text
PREVIEW_LIMIT_SYSTEM = 4
```

Every territory at that scale uses the same limit. The limit does not vary by
territory size, importance, available space, or dependency count.

When more immediate projected children exist, the projection displays `+N`,
where `N` is the number of immediate projected children omitted from the
preview. `N` is not the total analyzed-file count and not the number of deep
descendants.

### Projection order

The order is mandatory:

```text
ProjectStructure factual
  → transparent structural chain compression
  → projected territory hierarchy
  → visual counts + previewItems
  → Explorer projection/rendering
```

Preview calculation must consume the compressed projected hierarchy rather
than independently inspecting raw structure.

### Territory counts

`analyzedFileCount` counts every analyzed file in the factual subtree of the
territory. Compression never reduces this count and transparent wrappers do
not remove files.

For visible subdivisions, use an explicit metric equivalent to
`directChildTerritoryCount`: the number of projected territories that are
immediate visible children at the next scale. Avoid ambiguous counts of all
raw directories at arbitrary depth.

## Decision 3 — separate semantic scales

V1 uses separate semantic scales with drill-down. It does not use:

- React Flow compound parent nodes;
- nested React Flow territory hierarchy; or
- a global compound visualization.

Each semantic scale produces a flat set of rendered items. For example:

```text
System
├── auth
├── case
└── users
```

Entering `auth` produces a new flat scale such as:

```text
System / auth
├── auth.controller.ts
├── auth.service.ts
├── dto
└── guard
```

Entering `dto` produces the next semantic scale. The whole system remains
reachable through progressive exploration rather than simultaneous rendering.

### Projected item kinds

The projection distinguishes conceptually:

- `territory`;
- `file`; and
- `external-reference`.

A territory represents a projected structural unit. Its factual identity may
be a workspace package or directory and it carries an affordance equivalent to
`isDrillable` / `hasChildren`.

A file is an analyzed, terminal item at that structural scale. It must not look
drillable.

An external reference is dependency context. It is not a structural child, is
not part of `ProjectStructure`, and can be a clickable destination/contextual
item.

### Drillability affordance

Drillable territories must remain visually distinguishable from terminal files
at every visual LOD:

```text
DETAIL   → territory and file affordances distinct
COMPACT  → territory and file affordances distinct
MINIMAL  → territory and file affordances still distinct
```

External references must likewise preserve their essential external affordance
in every LOD.

### Scale transitions

Separate semantic scales do not require a hard screen replacement. The design
must allow:

```text
selection
  → camera move / zoom / pan
  → semantic projection transition
```

Camera animation can be tuned later, but the contracts must not prevent smooth
transitions.

### Context outside the current territory

Entering a territory does not conceptually erase the rest of the system.
Dependencies leaving the current territory may appear as clickable contextual
external references:

```text
service.ts → prisma   (outside this region)
```

Such references are derived from dependencies and are never false structural
children.

## Decision 4 — contextual aggregated routes

`ProjectGraph` remains factual and contains file-level relationships such as:

```text
file → file
file → external
```

Territory routes exist only in Explorer projection.

### Territory route aggregation

At a territorial semantic scale:

1. resolve the source file to its visible territory ancestor;
2. resolve the target file to its visible territory ancestor;
3. if the two territory IDs differ, group the relationship by the directional
   pair `sourceTerritory → targetTerritory`.

All file dependencies in one directional territorial pair form one projected
route. Conceptually:

```ts
interface TerritoryRoute {
  sourceTerritoryId: string;
  targetTerritoryId: string;
  relationCount: number;
  underlyingEdgeIds: string[];
}
```

`underlyingEdgeIds` preserve traceability to the exact `ProjectGraph` edges and
their evidence.

### Internal territorial relationships

If source and target resolve to the same visible territory, do not emit a
territory self-loop. Those relationships feed one internal relationship
summary, conceptually equivalent to:

```ts
interface TerritoryRelationshipSummary {
  internalEdgeIds: string[];
  outgoingGroups: TerritoryRelationshipGroup[];
  incomingGroups: TerritoryRelationshipGroup[];
}

interface TerritoryRelationshipGroup {
  relatedTerritoryId: string;
  relationCount: number;
  underlyingEdgeIds: string[];
}
```

The exact public shape may be refined during implementation, but route
aggregation and internal summaries must share one deterministic
ownership/resolution/aggregation logic. They must not implement separate
definitions of territorial membership.

### External dependencies

External packages:

- have no territory;
- do not enter `ProjectStructure`;
- remain external nodes in `ProjectGraph`.

Without territory focus, a territory may expose facts such as
`externalDependencyCount` and `externalPackageCount` without rendering every
external package on the initial system map.

With territory focus, directly related external packages may appear as
peripheral `external-reference` items, grouped deterministically by canonical
external identity or package specifier. They are dependency context, never
structural children and never containment members.

### Route attention and route scale

When routes are active, preserve:

```text
selected/direct
  > additional context
  > subdued
```

Unrelated routes remain subdued rather than necessarily disappearing. The
first territorial delivery must not make routes visually dominant.

Territory scale uses aggregated territory routes. File scale uses factual
file-to-file `ProjectGraph` relationships. File-level routes must not be laid
over a territory-level map as the default behavior.

## Decision 5 — controlled ExplorerLocation rewrite

The old structural navigation model is deliberately replaced rather than
preserved as a permanent compatibility architecture. The current
`system` / `workspace-package` / `file-overview` scopes encode assumptions that
Phase 5 generalizes.

The replacement is a controlled rewrite centered on an `ExplorerLocation`
concept with semantics equivalent to:

- `structuralPath`;
- `currentTerritoryId` or root;
- optional `selectedItemId`;
- optional `focusedFileId`; and
- `expandedItemIds` / contextual expansion.

Names and exact TypeScript shapes may follow the existing code conventions,
but the semantics are required.

Workspace packages and directories participate in one territorial navigation
language. `workspace-package` is no longer a special structural scope, and
`file-overview` is no longer the structural fallback for projects without a
workspace. Non-workspace projects use the generic filesystem territory tree.

The following concepts remain orthogonal and are preserved:

- selection;
- focus;
- anchor;
- additional context;
- search;
- attention hierarchy;
- inspector;
- viewport controls.

### Characterization safety net

Before replacing the current state/navigation implementation, characterization
tests must capture behavior that remains valid:

- search;
- breadcrumb behavior;
- attention hierarchy;
- inspector behavior;
- file focus;
- navigation callbacks.

These tests protect observable behavior without freezing assumptions that this
spec deliberately removes. When old behavior is intentionally replaced, its
test expectation is revised deliberately rather than treated as an accidental
regression. The old implementation must not be removed until the new
`ExplorerLocation` satisfies the relevant characterization gates.

### Location transition rule

When `structuralPath` changes through drill-down, breadcrumb-up, or territory
navigation, reset transient state from the previous scale:

- `selectedItemId`;
- `focusedFileId`; and
- `expandedItemIds`.

Transient state must not cross semantic scales accidentally.

### Explicit destination navigation

Navigation with an explicit destination may rebuild state atomically. For
example:

```text
search → auth.service.ts
```

must resolve the owning projected territory/location, navigate to the correct
structural path, select the file, and apply focus when requested.

External-reference navigation follows the same principle where a destination
is explicit.

### Feature gating by territory kind

Uniform territory navigation does not imply uniform capabilities. Features
specific to workspace packages must check `Territory.kind ===
'workspace-package'`.

For example, `aggregatePackageDependencies()` must not be generalized to a
directory territory automatically. A directory does not inherit workspace
package capabilities merely because both are visible territories.

## Decision 6 — per-scale deterministic layout

V1 does not use a global hierarchical ELK layout. Every `ExplorerLocation`
produces an independent flat layout:

```text
projected flat items → ELK → positions
```

The current ELK integration in `explorer-model.ts` already accepts flat
children, uses `layered` with direction `RIGHT`, and consumes returned `x/y`
positions. Phase 5 keeps ELK as a layout engine but changes the logical input
per semantic scale.

### Layout identity

Independent layouts still need stable spatial identity. Conceptually:

```ts
interface LayoutIdentity {
  locationKey: string;
  projectionKey: string;
  orderedItemIds: string[];
}
```

The complete peer list sent to ELK must be canonically ordered. Structural
items use:

```text
normalizedStructuralPath → stableId
```

External references use a stable canonical key derived from external identity
or package specifier.

The same complete ordered peer list feeds both `LayoutIdentity.orderedItemIds`
and the ELK children input. Map/Set insertion order or filesystem discovery
order is never sufficient.

### Layout edge determinism

Layout-relevant routes are canonically ordered as well. `projectionKey` must
include every input capable of changing the logical layout, including
layout-relevant edges/routes, not only the node set.

The same location, semantic projection, and layout-relevant relationships must
produce the same logical ELK input.

### Layout storage and camera continuity

An in-memory session cache may preserve layouts for return/context behavior.
Durable persistence is out of scope. Coordinates belong exclusively to the
presentation layer; neither `ProjectStructure` nor `ProjectGraph` gains
position fields.

Independent layouts must remain compatible with camera transitions. For
example, entering `auth` may focus the selected territory, move the camera,
replace the projection, and reveal the child scale without requiring compound
nodes.

## Decision 7 — density affects visual LOD only

Density never changes:

- containment;
- `ExplorerTerritoryProjection` membership;
- peer membership;
- semantic scale; or
- navigation.

All projected peers remain present. Density and zoom affect only rendered
information detail:

```text
DETAIL  → name + counts + preview
COMPACT → name + counts
MINIMAL → name + persistent semantic affordances
```

Exact zoom thresholds are visual tuning and are not frozen in this architecture
spec. At the same scale and zoom, every territory uses the same LOD policy;
importance-based exceptions are forbidden.

### LOD invariants

LOD never changes structural identity, peer membership, clickability,
navigation identity, containment, or semantic scale. `isDrillable` remains
visible in `MINIMAL`, and external references retain their essential external
affordance there as well.

### Dense scale guardrail

V1 fixes:

```text
DENSE_SCALE_PEER_THRESHOLD = 70
```

The count is the number of projected direct peers for one `ExplorerLocation`,
after transparent structural compression.

- below 70: use the normal initial LOD policy;
- 70 or more: classify the location as `Dense Scale`.

Dense Scale changes only the initial presentation detail, selecting an
appropriate compact/minimal starting LOD. All peers remain projected,
rendered, navigable, and members of the same scale and layout. Dense Scale
must not hide, rank, score, cluster, paginate, switch semantic scale, or alter
containment.

The threshold belongs to an explicit visual presentation policy. It is not a
CSS magic number, a `ProjectStructure` property, a `ProjectGraph` property, or
a territory membership rule:

```text
TerritoryProjection
  → all projected peers
  → VisualPresentationPolicy
  → denseScale = peerCount >= DENSE_SCALE_PEER_THRESHOLD
  → initial LOD
```

### Density reopening rule

Density architecture may be reconsidered only when:

1. a real project reaches Dense Scale; and
2. Dense Scale plus compact/minimal LOD, pan/zoom, and search demonstrates an
   objective, reproducible legibility or navigation failure.

Reaching 70 peers alone does not authorize clustering. Clustering, spatial
pagination, or another density strategy remains a future evidence-driven
decision.

## Conceptual interfaces

These interfaces guide implementation planning without freezing incidental
TypeScript names:

```ts
type TerritoryKind = 'directory' | 'workspace-package';

interface ExplorerTerritory {
  id: string;
  kind: TerritoryKind;
  structuralPath: string[];
  label: string;
  isDrillable: boolean;
  analyzedFileCount: number;
  directChildTerritoryCount: number;
  previewItems: TerritoryPreviewItem[];
  internalRelationships: TerritoryRelationshipSummary;
}

type TerritoryPreviewItem =
  | { kind: 'territory'; territoryId: string; structuralPath: string[]; label: string; isDrillable: boolean }
  | { kind: 'file'; fileId: string; structuralPath: string[]; label: string };

interface ExternalReference {
  kind: 'external-reference';
  id: string;
  canonicalIdentity: string;
  label: string;
  relationCount: number;
}

interface ExplorerLocation {
  structuralPath: string[];
  currentTerritoryId: string | null;
  selectedItemId: string | null;
  focusedFileId: string | null;
  expandedItemIds: string[];
}

interface TerritoryRoute {
  sourceTerritoryId: string;
  targetTerritoryId: string;
  relationCount: number;
  underlyingEdgeIds: string[];
}

interface LayoutIdentity {
  locationKey: string;
  projectionKey: string;
  orderedItemIds: string[];
}
```

The exact contracts may be refined against the existing Explorer types, but
the following semantics are not optional:

- full structural identity remains available for drill-down and breadcrumbs;
- preview items are not rendered children;
- external references are not structural children;
- territory routes retain underlying graph edge IDs;
- all peer ordering is canonical;
- territory kind controls feature eligibility;
- LOD does not mutate projection membership.

## Recommended projection boundary

The recommended new module is:

```text
apps/explorer-web/src/explorer-territory-projection.ts
```

Its conceptual boundary is:

```text
ProjectStructure
  → ExplorerTerritoryProjection
  → ExplorerProjection / composition
  → ExplorerElements
  → ELK
  → React Flow
```

This keeps the useful-hierarchy policy in the presentation application, where
it can use `ExplorerLocation`, while preserving `ProjectStructure` as factual
input. It also leaves `ProjectGraph` as the sole source of dependency facts and
allows route aggregation to remain a projection concern.

The module must not infer domain, feature, bounded context, infrastructure,
application layer, business module, or any other architectural role from
directory names.

## Explorer rewrite consequences

The current `ExplorerState` scopes and `ExplorerProjection` modes are not the
future structural model:

```text
current scopes: system | workspace-package | file-overview
current modes:  system | overview | focus
```

They are replaced/generalized for territorial navigation. Selection, focus,
anchor, context, search, attention, inspector, and viewport behavior remain
orthogonal and are carried into the new model deliberately.

The current attention hierarchy remains:

```text
anchor
  > selected inspection
  > direct
  > additional context
  > subdued
  > baseline when applicable
```

It may be adapted for territory, file, route, and external-reference items,
but its meaning must not be silently replaced.

## Implementation surface

Likely production changes are concentrated in `apps/explorer-web/`:

- `explorer-state.ts`: `ExplorerLocation`, territory selection, expansion, and
  reset rules.
- `explorer-orientation.ts`: structural breadcrumbs and semantic scales.
- `explorer-territory-projection.ts`: new useful-hierarchy policy.
- `explorer-projection.ts`: composition of territory items, files, external
  references, and scale-specific routes.
- `explorer-model.ts`: visual item types, LOD, deterministic per-scale ELK
  input, and positions.
- `explorer-graph.tsx`: territory, file, external-reference, and route visuals.
- `explorer-attention.ts`: preserved hierarchy across the new item kinds.
- `main.tsx`: location transitions, camera continuity, search destinations, and
  callbacks.
- `explorer-shell.tsx`: scale identity, breadcrumb, summary, and actions.
- `explorer-details.tsx`: territory and external-reference inspection.
- `styles/graph.css`, `styles/shell.css`, and `styles/responsive.css`: visual
  treatment and responsive behavior.

Possible, not mandatory, additions include a dedicated territory visual
component and a separate layout adapter if `explorer-model.ts` becomes too
large. Their introduction is an implementation decision, not an architectural
requirement of this spec.

Likely tests include existing Explorer projection/state tests and new tests for
compression, preview ordering/limits, territory route aggregation,
`ExplorerLocation` transitions, external references, LOD invariants, and layout
identity. Browser tests are implementation validation, not part of this design
document.

## Risks

### V1 risks

1. Controlled `ExplorerLocation` rewrite may accidentally carry old
   package-only assumptions or lose characterization behavior.
2. Composing structural territories with file/external projection may duplicate
   nodes or blur territory versus route semantics.
3. Shared ownership/resolution logic may drift between cross-territory route
   aggregation and internal relationship summaries.
4. Workspace-only capabilities may leak into directory territories without
   explicit `Territory.kind` gating.
5. External-reference navigation may be confused with structural drill-down.
6. Per-scale deterministic layout and camera transitions may lose context or
   produce unstable positions when peers or routes change.
7. LOD and Dense Scale work may regress into a visual “cards + arrows” map or
   accidentally hide peers.

### Future evolution risks

- compound React Flow territories and global hierarchical ELK would introduce
  coordinate, bounds, and cross-container routing complexity;
- clustering, ranking, and spatial pagination could obscure evidence and would
  require separate real-project legibility evidence;
- symbol-level visual scales would require new analyzer facts and are not
  implied by this structure design.

## Protected boundaries

The following remain unchanged by Phase 5:

- factual `ProjectStructure` and its typed containment sources;
- dependency-only `ProjectGraph`;
- `AnalysisResult` and `schemaVersion`;
- Snapshot V1;
- internal/external dependency semantics;
- diagnostics semantics;
- graph-engine analytical contracts;
- no directory nodes or containment edges in `ProjectGraph`;
- no synthetic workspace-package → directory relationship;
- no architectural roles inferred from folder names;
- no visual policy or layout coordinates in analyzer or graph-engine;
- no external reference represented as structural containment.

## Explicitly out of scope

This design does not approve:

- implementation of Phase 5;
- AI architectural interpretation;
- framework-derived architecture roles;
- domain/feature/layer inference from directory names;
- symbol-level analysis;
- clustering, ranking, importance scoring, hidden peer selection, or spatial
  pagination;
- automatic semantic-scale switching;
- compound React Flow parent/child territories;
- global hierarchical ELK;
- durable layout persistence;
- changes to `ProjectStructure`, `ProjectGraph`, `AnalysisResult`, or Snapshot
  V1.

## Human decisions required before implementation planning

The seven decisions above are fixed. The following details remain open only
where implementation choices are genuinely consequential:

1. The exact TypeScript shape used to compose `ExplorerTerritoryProjection`
   with the existing `ExplorerProjection` types.
2. The concrete visual treatment of territory previews and the persistent
   minimal affordances for drillable territories and external references.
3. The exact camera transition choreography between independent layouts.
4. The concrete inspector content and route summary wording for territories.
5. The exact zoom thresholds for DETAIL, COMPACT, and MINIMAL LOD.
6. Whether a dedicated territory React component or a larger existing node
   adapter is the smaller maintainable implementation after characterization
   tests are in place.

These are not permissions to reinterpret the approved architecture. They must
be resolved without changing the protected boundaries or the seven decisions.
