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

The Explorer generates a disposable snapshot by analyzing the local BunkerCode
PNPM workspace. Every project opens on a Web-local comprehension reference that
organizes existing evidence as observable parts, factual Responsibility
findings, factual relations, and explicit uncertainty/coverage. This is a pure
presentation projection, not a universal architecture, semantic Perspective,
or domain contract. Responsibility and Territory remain the two depth lenses,
and entering or leaving Overview never resets `ExplorerLocation`.

The comprehension projection reuses System Orientation for factual
cross-package dependency directions, actually imported external-module
touchpoints, cycles, isolated files, and unresolved dependencies. Territory,
file, and subject IDs remain the anchors back to existing evidence. Observable
parts are exactly the direct structural children already projected at System
scale; workspace packages are not promoted over an aggregate Territory. A
Responsibility finding proves only localized subject evidence and never
establishes the architectural meaning of its containing part. That meaning
remains explicitly undetermined whether findings exist or not. Only partial,
not-evaluated, unsupported, and failed coverage belongs to comprehension
uncertainty; evaluated coverage remains available from the original
Responsibility projection. No analyzer, detector, contract, graph-engine fact,
score, or architectural category is introduced by this presentation layer.

Its sole structural navigation model is `ExplorerLocation`
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
