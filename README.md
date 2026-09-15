# BunkerCode

> Map your system before changing it.

BunkerCode is a local-first application for investigating software architecture, dependencies, diagnostics, impact, and historical changes.

## Usage

Analyze a local TypeScript project with a `tsconfig.json`:

```bash
pnpm --silent analyze fixtures/simple-import
```

The command writes deterministic JSON to `stdout` with:

- `analysis`: the TypeScript analyzer contract;
- `graph`: the language-independent project graph;
- `diagnostics`: evidence-backed architectural diagnostics.
- `structure`: detected workspace containment and unassigned files;
- `packageDependencies`: cross-package dependencies aggregated from file-level graph edges.

The `analysis` payload is deterministic, serializable, and serves as Snapshot V1
for the browser frontier.

Query file-level structural impact with a project-relative target path:

```bash
pnpm --silent impact fixtures/simple-import src/service.ts
```

The command writes deterministic JSON to `stdout` with the target file, direct
and transitive dependents, propagation depth, shortest impact paths, and
factual circularity evidence for the target when applicable.

When the target is a PNPM workspace root, the analyzer detects packages declared
by `pnpm-workspace.yaml`, builds a file-level graph across their TypeScript
projects, and includes structural containment plus package dependency aggregation
in the `analyze` JSON. This repository itself can therefore be analyzed with:

```bash
pnpm --silent analyze .
```

Package roots without their own `tsconfig.json` remain structurally visible but
do not contribute TypeScript files to that workspace analysis.

`analysis.tsconfigPath` is present only for a single TypeScript project target.
For a PNPM workspace target, `analysis.workspaceConfigurationPath` identifies
`pnpm-workspace.yaml`; it is never represented as a TypeScript configuration.

Argument and analysis errors are written to `stderr` and return a non-zero exit code.

## Validation

Run the standard deterministic checks:

```bash
pnpm typecheck
pnpm test
```

Run the real browser frontier check when local Firefox access is available:

```bash
pnpm test:browser
```

The browser check uses `puppeteer-core` with the system Firefox executable at
`/usr/bin/firefox`. Override it with `BUNKERCODE_BROWSER_EXECUTABLE` when needed.

## Explorer

The Explorer generates a disposable snapshot from an explicit supported target.
Overview now opens on a Web-local factual System Map derived from the analysis
root, its structural geography, and an initial non-overlapping landmark
frontier. The frontier crosses only trivial structural wrappers and therefore
does not depend on a directory named `src`; workspace-package identities stop
that crossing and remain factual facets of their physical region. Direct files
remain file landmarks inside the refined region that reveals them; files at
the actual global frontier remain on the System surface. Each aggregate preserves its originating file-level
`ProjectGraphEdge` records; its count is observed dependency volume, not
importance, runtime frequency, or architectural weight.

The System Map is a pure Explorer presentation projection, not a universal
architecture, semantic Perspective, or domain contract. An arrow means only
that files represented by its source have observed internal dependencies on
files represented by its target. Territory remains the structural investigation
surface. Responsibility remains available as a separate depth surface, while
its System Map overlay and secondary System context are not yet projected onto
this new frontier scale. Entering or leaving Overview does not reset
`ExplorerLocation`.

The normal Overview renders that projection as a deterministic, neutral
hierarchy of structural landmarks and persistent context frames. Aggregate relations remain
in the projection but are hidden at rest; selecting a region or direct file
emphasizes every incident direction as **Uses** or **Used by**, and selecting a
relation discloses its observed count and originating file-edge evidence in a
contextual inspector rail outside the canvas. **All dependencies** explicitly
reveals the complete set of arrows. Position follows factual item order
and containment only; dependency direction, counts, project identity, and
selection do not affect geography.

Semantic zoom in the current System Map refines the landmark frontier while
keeping the analysis-root boundary fixed. Selecting a region only inspects it;
the **Zoom in** control on the landmark replaces that aggregate landmark with
its next factual subdivision while preserving its siblings. Trivial one-child
wrappers may be crossed without name-based rules, nested workspace-package
identities remain protected, and explicit collapse restores the coarser
frontier. Refined regions remain visible as context frames; nested refinements
create frames within frames, with collapse controls in their headers. These
frames own no files and are never dependency endpoints. Every scale is
reprojected through the same file ownership and dependency-evidence rules.
The inspector is not a navigation prerequisite. Native buttons support keyboard
refinement and collapse; focus transfers to the new collapse control and back
to the restored landmark. Double-click is an optional refinement shortcut.

The Explorer computes frame sizes and parent-relative positions before handing
them to React Flow. Ordered two-dimensional packing uses containment, child
dimensions and available workspace width. Regions and files share bounded
rows inside their factual parent; expanded regions in broad subdivisions share
the available width. Selection and the inspector do not repack the map.
Skipped wrappers can remain passive **Folder context** frames, preserving the
path of files without adding a compulsory navigation step. Empty intermediate
wrapper chains are compressed into the terminal context's factual full path.

Expansion preserves ordering and local coordinates where space permits, but
overflow can wrap siblings. The camera keeps an overview while it is readable,
then focuses the opened region when fitting everything would shrink it too far.
Frame **Focus**, geographic breadcrumbs and **System · fit all** change only
the camera, not the frontier. Short camera transitions respect reduced motion.
Pan and zoom remain available; deeply expanded maps still need regional focus
to read every label. Dependency curves preserve factual endpoints but do not
yet route around other boxes.

To reproduce desktop captures locally without replacing the development snapshot:

```bash
node --import tsx apps/explorer-web/scripts/capture-system-map.ts . /tmp/bunkercode-map +directory:packages +directory:packages/graph-engine
```

The capture runner accepts `+regionId` (refine), `-regionId` (collapse),
`=itemId` (inspect), and `@system` (fit all). It statically analyzes the target,
serves the Explorer only on loopback, and saves screenshots and box measurements
in the supplied output directory. It does not run the analyzed application's code.

The default **Structure** view currently contains only the structural frontier
and its observed internal relations. Responsibility overlay, external
touchpoints, unresolved dependencies, analysis limits, cycles, and isolated
files are not yet mapped to this frontier or presented in the current Overview.
Regions remain observed structure whose architectural role is not inferred.

At narrow widths the same canvas and model positions remain in use while the
inspector moves below the map; touch-independent zoom/fit controls and page
scroll keep dense systems investigable without hiding Territories or relations.

The separate Territory surface uses `ExplorerLocation`
over an `ExplorerTerritoryProjection`: root shows direct Territories and files;
each Territory shows only its direct child Territories and files; and focused
files show their factual direct relationships. The header identifies the
current **System**, **Territory**, or **File connections** scale. System and
Territory use a DOM/CSS spatial containment map: Territories are bounded
regions with factual direct-child previews, while files are subordinate
landmarks. The spatial composition varies deterministically only with the
number and order of direct Territories; it never encodes file count or
importance. Selecting a Territory inspects it; **Open territory** drills down.
Selecting an internal file only inspects it; **Show direct connections** enters
the React Flow/ELK relationship view.

The Responsibility perspective uses a separate DOM/CSS semantic spatial map.
Canonical Families form taxonomy regions—not filesystem containment—and each
factual Responsibility is an equally weighted landmark. Selecting a landmark
reveals a bounded deterministic subject preview and a contextual inspector;
all original findings remain available progressively. Coverage stays a
secondary disclosure, while **Locate in Territory** crosses from WHAT ROLE to
the already-derived factual WHERE without creating Responsibility edges.

A workspace package remains a factual Territory kind, alongside directory
Territories. It is not a special System-map card or a distinct navigation
state. Root and directory/package Territory views therefore share the same
composition, deterministic ordering, evidence, breadcrumb, and structural
Back behavior. The inspector is contextual rather than a permanently reserved
column. Back moves to the actual structural parent; a focused file returns to
the Territory that contextualizes it.

Every visible relationship keeps the analytical direction **source → target**
and presents it as **source uses target**. Closed arrowheads point to what is
used, and file-connection selection labels outgoing relationships as **Uses**
and incoming relationships as **Used by**.
Duplicate file occurrences between the same two nodes share one visual edge,
while the details panel retains every supporting location and confidence value.

Generate a snapshot for an explicit target and start the local Explorer:

```bash
pnpm explorer .
pnpm explorer ../another-local-project
pnpm explorer /absolute/path/to/another-local-project
```

The repository path is resolved from the directory where the command is run.
With no argument, `pnpm explorer` uses BunkerCode itself. A root already
supported by the TypeScript analyzer remains the single target. Otherwise,
discovery searches only below that repository for supported TypeScript project
roots: one candidate is selected automatically, zero candidates fail clearly,
and multiple candidates fail with an ordered list so the user can provide one
explicitly. Discovery never chooses by directory names or scans sibling
projects. The selected target is analyzed read-only and the disposable snapshot
is written only inside this repository.

Build the Web application with:

```bash
pnpm --filter @bunker-code/explorer-web build
```

The generated snapshot at `apps/explorer-web/src/generated/` is ignored by Git.
Source code remains the source of truth; regenerate the snapshot after analyzer
changes rather than treating it as persisted Explorer data. Its Web delivery
payload carries the `AnalysisResult` and the separate
`ResponsibilityAnalysisResult`. ProjectGraph relationships are rebuilt only
from analysis. A presentation-independent Responsibility projection now
composes original factual findings by canonical family and responsibility with
their deepest factual Territory context. Responsibility lens eligibility is
deterministic: any Interface, Security, Data, Integration, or Async Processing
finding enables the lens; Framework Wiring alone and zero findings do not.
Eligibility no longer chooses the initial surface. Partial coverage remains
explicit and may still enable the lens when a factual behavioral finding exists.
The Explorer renders Responsibility beside Territory: families provide visual
regions, responsibilities are the primary landmarks, and progressive subject
details can locate their factual file in its owning Territory without changing
the meaning of `ExplorerLocation`. Coverage limitations and evidence/provenance
remain progressively disclosed. This composition creates no responsibility
relationships.
The Explorer derives package dependency directions from the existing
`ProjectGraph` and `ProjectStructure` in the browser; it does not receive or
store a separate package-dependency delivery contract.

Current Responsibility coverage is intentionally evidence-backed and narrow:
the implemented TypeScript detectors use NestJS and Prisma as the first
technology-specific evidence sources. BunkerCode is not a NestJS/Prisma product,
and TypeScript/Node is the first concrete analyzer rather than the final product
boundary. Expanding semantic coverage across backend frameworks, stacks, and
future languages is a separate architectural investigation; no unsupported role
is inferred from names, paths, or missing findings.

The Explorer searches internal files by path or name. A result resolves to its
deepest factual owning Territory, then selects the file in that context. Files
from outside the focused file's Territory can appear only as direct factual
relationship context. Returning from File connections preserves its anchor as
the selected file. Switching Responsibility and Territory preserves structural
location; Trace and semantic Impact remain outside the current Explorer phase.

Selecting a file now presents its filename before its full path and distinguishes
a file in the current Territory, a file shown as relationship context, and a module
outside the analyzed system. `Uses` and `Used by` group repeated source/target
occurrences for first reading. `Technical details` and `How BunkerCode knows`
remain closed until requested; the latter retains every exact module specifier,
source/target identity, location, and confidence value.

Small contextual disclosures now connect the human-first labels to terms such
as PNPM workspace, workspace package, dependency, dependent, external module,
connection anchor, evidence, module specifier, and confidence. They remain
closed by default, work with keyboard and touch, and do not change selection,
navigation, graph projection, or analytical facts.

The canvas applies a deterministic attention hierarchy without hiding graph
facts. Selection emphasizes its direct Uses / Used by neighborhood and quiets
unrelated visible context. File connections keeps its anchor as the structural
center even while another item is selected, and one-more-step nodes are marked
as additional context. File maps keep a readable fit floor and allow panning to
remaining context instead of forcing every label into a microscopic overview.

The production Explorer uses a restrained planning-room visual system across
its orientation shell, map canvas, Territory nodes, details, and evidence.
Responsive layouts keep the canvas primary on wide screens and deliberately
stack map and details at 640 px. These are Web presentation choices only:
analytical facts, direction, evidence, and navigation state remain unchanged.
