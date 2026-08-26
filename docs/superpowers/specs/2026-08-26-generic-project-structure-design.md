# Generic Project Structure Design

Status: approved for implementation planning

Date: 2026-08-26

Scope: generic factual containment beyond PNPM workspace packages

## Context

BunkerCode currently separates two analytical models:

- `ProjectGraph` represents dependency relationships between analyzed files and
  external modules;
- `ProjectStructure` represents where analyzed files belong.

That separation is correct and must remain. The current structural model,
however, only understands declared PNPM workspace packages. A normal
TypeScript project with analyzed files in `src/auth/`, `src/missions/`, and
`test/` has factual filesystem containment, but the current
`ProjectStructure` cannot express it.

The real `../BunkerMode/api` analysis demonstrates the gap. It produces 46
analyzed files, while `buildProjectStructure()` currently returns:

```text
packages: []
fileMemberships: []
unassignedFileIds: [all 46 analyzed file IDs]
```

This result is not evidence that the project has no structure. It means only
that no workspace package memberships were supplied. The analyzed file paths
already prove a filesystem hierarchy that the current structure contract does
not model.

The existing implementation has these relevant boundaries:

- `AnalysisResult.files` contains deterministic normalized file IDs and paths;
- `AnalysisResult.structure`, when present, contains analyzer-provided PNPM
  packages and file memberships;
- `buildProjectStructure()` in `graph-engine` normalizes those facts, filters
  invalid memberships, and builds workspace query indexes;
- `aggregatePackageDependencies()` uses only workspace membership and internal
  `ProjectGraph` edges;
- the Explorer currently chooses its workspace system map from
  `ProjectStructure.packages` and otherwise uses its file-level fallback.

This design extends the structural model without changing those established
dependency or presentation boundaries.

## Problem

`ProjectStructure` currently makes containment synonymous with workspace
package membership. That is too narrow for ordinary TypeScript projects and
also conflates two different factual sources:

1. declared containment, such as a package selected by
   `pnpm-workspace.yaml` and backed by a local `package.json`;
2. filesystem containment, such as `src/auth/` containing
   `src/auth/auth.service.ts`.

Both are facts, but they make different claims. A directory path does not
prove a domain, feature, framework module, layer, bounded context, or business
area. A workspace package and a directory may also occupy the same path
without being the same structural unit.

The model must additionally explain what was actually reported or derived. An
empty array alone cannot distinguish a proven absence of filesystem
subdivision from an analyzer that did not report workspace facts.

## Goals

The future implementation must:

- make the analysis root explicit;
- represent generic structural units and typed containment relations;
- derive a complete analysis-relevant directory tree from existing analyzed
  file paths and relevant declared unit paths;
- preserve declared PNPM workspace packages and their provenance;
- allow directory and workspace-package units to coexist at the same
  normalized path;
- make all in-root analyzed files reachable from the analysis root through
  factual filesystem containment, including files directly at the root;
- expose only source states that can be proven from the current input;
- preserve existing workspace fields, queries, package aggregation, snapshots,
  and Explorer behavior during migration;
- remain deterministic, language-independent, serializable, and independent
  of renderer or framework concepts.

## Non-goals

This design does not authorize:

- any change to `ProjectGraph`, its node kinds, or its dependency edges;
- directory nodes or synthetic containment edges in `ProjectGraph`;
- architectural roles such as domain, feature, module, service layer,
  infrastructure, or bounded context;
- NestJS-specific recognition or any other framework interpretation;
- `territory`, `isUseful`, `importance`, semantic zoom, or navigation
  heuristics;
- Explorer rendering of directories, React Flow changes, ELK changes, or a
  visual Phase 5 redesign;
- automatic `tsconfig` discovery, multiple-target discovery, other package
  managers, multiple languages, symbols, classes, or functions;
- materializing directory structure into `AnalysisResult` or changing Snapshot
  V1;
- indiscriminate filesystem scanning, including `node_modules`, build output,
  assets, or unrelated directories;
- implementation or an implementation plan in this document.

## Approved architecture

```text
AnalysisResult
├── analyzed files and normalized paths
└── analyzer-provided declared facts
    └── today: PNPM workspace packages and memberships
                 │
                 ▼
           graph-engine
                 │
                 ▼
       buildProjectStructure()
                 │
                 ▼
          ProjectStructure
          ├── analysis root
          ├── directory structural units
          ├── workspace-package structural units
          ├── typed containment relations
          ├── source reports
          └── workspace compatibility views
                 │
                 ▼
       ExplorerProjection, in a future visual phase,
       chooses which factual levels are useful to display
```

`AnalysisResult` remains the source of primary facts. The TypeScript analyzer
continues to report analyzed files and the declared PNPM facts it already
knows. The language-independent `graph-engine` derives directory structure
from those facts in `buildProjectStructure()`.

This keeps filesystem derivation reusable by future analyzers and avoids an
incidental Snapshot V1 change. Old Snapshot V1 values containing only analyzed
file paths, with or without the optional current workspace structure, remain
valid inputs to the new builder.

## Core invariants

1. `ProjectStructure` represents containment.
2. `ProjectGraph` represents dependencies and relationships.
3. `ProjectGraph` never becomes a hybrid dependency/containment graph.
4. Every unit and relation introduced in this phase is factual.
5. A directory path proves filesystem containment only. It never proves an
   architectural role.
6. A workspace package and a directory are distinct units even when their
   `rootPath` values are equal.
7. Containment is typed by source. A file can participate in analysis-target
   selection, one filesystem path, and one workspace membership without
   contradiction.
8. Filesystem containment is a tree rooted at the analysis root. Declared
   workspace containment is a parallel structural axis.
9. Only directories induced by analyzed files or relevant declared structural
   units are represented. The builder does not scan the filesystem.
10. The core stores the complete factual hierarchy relevant to the analysis.
    Projection decides later which levels to show.
11. Public paths use normalized `/` separators and deterministic relative
    forms; public collections and identifiers are deterministic.
12. Files directly in the analysis root are contained directly by the root;
    the absence of a directory subdivision does not make them structurally
    invisible.
13. Existing workspace IDs, evidence, memberships, queries, and package
    aggregation retain their current semantics.
14. `unassignedFileIds` continues to mean files without a valid workspace
    package membership, not files without any structural containment.

## Conceptual contract

The following TypeScript is a conceptual target. Exact declarations may be
split across existing `graph-engine` files during implementation, but their
observable semantics must match this design.

```ts
interface ProjectStructure {
  rootUnitId: string;
  units: StructuralUnit[];
  containments: StructuralContainment[];
  sourceReports: StructuralSourceReport[];

  // Compatibility views. These retain their current workspace-specific
  // semantics until a separately approved breaking migration removes them.
  packages: WorkspacePackage[];
  fileMemberships: FileWorkspacePackageMembership[];
  unassignedFileIds: string[];
}

type StructuralUnit =
  | AnalysisRootStructuralUnit
  | DirectoryStructuralUnit
  | WorkspacePackage;

type StructuralSource =
  | 'analysis-target'
  | 'filesystem'
  | 'pnpm-workspace';

interface AnalysisRootStructuralUnit {
  id: 'analysis-root:.';
  kind: 'analysis-root';
  rootPath: '.';
  source: 'analysis-target';
}

interface DirectoryStructuralUnit {
  id: string;
  kind: 'directory';
  rootPath: string;
  source: 'filesystem';
}

interface StructuralContainment {
  parentUnitId: string;
  child: StructuralChildReference;
  source: StructuralSource;
}

type StructuralChildReference =
  | { kind: 'structural-unit'; structuralUnitId: string }
  | { kind: 'file'; fileId: string };

type StructuralSourceReport =
  | {
      source: 'analysis-target';
      status: 'reported';
    }
  | {
      source: 'filesystem';
      status: 'subdivision-detected' | 'no-subdivision';
    }
  | {
      source: 'pnpm-workspace';
      status: 'reported' | 'not-reported';
    };
```

The existing `WorkspacePackage` and `FileWorkspacePackageMembership` contracts
remain initially unchanged:

```ts
interface WorkspacePackage {
  id: string;
  kind: 'workspace-package';
  origin: 'detected';
  rootPath: string;
  name?: string;
  evidence: WorkspacePackageEvidence[];
}

interface FileWorkspacePackageMembership {
  fileId: string;
  workspacePackageId: string;
}
```

### Identity and path rules

- The analysis root has the single stable ID `analysis-root:.` and path `.`.
- A directory unit ID is `directory:<normalized-rootPath>`. For example,
  `src/auth` has ID `directory:src/auth`.
- Existing workspace package IDs are unchanged, including the current
  `workspace-package:<normalized-rootPath>` form produced by the PNPM analyzer.
- The analysis root is not duplicated as a directory unit. A workspace package
  rooted at `.` may coexist with the analysis-root unit because it represents a
  different declared fact.
- Directory `rootPath` values have no leading slash, no trailing slash, use
  `/`, and never use `.` for the root.
- Containment relations do not need public IDs in this phase. Their tuple of
  `source`, `parentUnitId`, and discriminated child reference is a stable
  identity and avoids another public identifier convention without a consumer.
- `units` sort by `kind` and then `id`.
- `containments` sort by `source`, `parentUnitId`, child `kind`, and child ID.
- `sourceReports` sort by `source`.
- Existing `packages`, `fileMemberships`, and `unassignedFileIds` retain their
  current ordering rules.

### Containment semantics by source

Analysis-target containment records analysis selection:

- the analysis root contains every file listed in `analysis.files`, with source
  `analysis-target`;
- this relation means “this file belongs to the analyzed input set,” not “this
  file is physically located directly in the root directory”;
- this axis makes analysis membership explicit even when a valid
  target-relative path refers outside the root, as can occur with TypeScript
  project inputs that include referenced source files.

Filesystem containment forms one factual tree:

- the analysis root contains each top-level induced directory;
- each directory contains its direct induced subdirectories;
- the analysis root or a directory contains each directly nested analyzed
  file;
- a file appears once in the filesystem containment axis;
- no directory is skipped merely because a projection might consider it
  visually unhelpful.

PNPM workspace containment forms a parallel declared view:

- the analysis root contains each reported workspace-package unit, with source
  `pnpm-workspace`;
- each valid existing `FileWorkspacePackageMembership` becomes a package-to-file
  containment with source `pnpm-workspace`;
- an invalid membership, referring to an absent analyzed file or package,
  remains filtered exactly as it is today and produces no generic relation;
- no package-to-directory relation is created merely because a package and
  directory share a `rootPath`.

The combined model is therefore not globally a single-parent tree. It is a set
of typed containment axes. Within the filesystem source, parentage is a tree;
across sources, the same file may have analysis-target, directory, and
workspace-package parents.

## Directory derivation and granularity

`buildProjectStructure()` derives directories without reading the filesystem.
The input set consists only of in-root paths from:

- normalized paths from `analysis.files`;
- normalized `rootPath` values of valid analyzer-reported structural units,
  currently PNPM workspace packages.

For every input path, the builder derives each directory ancestor below the
analysis root. For example:

```text
src/auth/internal/token.ts
```

induces:

```text
src
src/auth
src/auth/internal
```

An empty declared workspace package still induces its package root directory
and ancestors because its manifest-backed `rootPath` is a relevant declared
fact. An arbitrary empty directory that is neither on an analyzed file path nor
the path of a declared unit is not represented.

This policy deliberately separates two questions:

- **Core fact:** which analysis-relevant directories and direct containment
  relations are entailed by the available paths?
- **Future projection choice:** which of those levels are useful at the current
  visual scale?

The core does not add `isUseful`, flatten single-child directory chains, pick
feature-looking folders, or apply framework/name heuristics. A future
`ExplorerProjection` may choose display levels without deleting or rewriting
the underlying facts.

Paths that cannot denote descendants of the analysis root must never be made
filesystem children of it by stripping `..` segments or absolute prefixes. A
normalized target-relative analyzed path such as `../shared/source.ts` remains
represented by its factual analysis-target containment, but it does not induce
directory units or filesystem relations below `analysis-root:.`. An absolute
or otherwise malformed public path violates the existing normalized-relative
path contract and must fail explicitly. Defining broader multi-root filesystem
containment is outside this design.

## Data flow

For one `AnalysisResult`, the future `buildProjectStructure()` performs this
logical flow:

1. Read analyzed file identities and normalized paths.
2. Normalize the optional current declared structure exactly as today:
   deterministically sort packages and retain only memberships whose file and
   package both exist.
3. Create the single analysis-root unit and one analysis-target containment to
   every analyzed file.
4. Derive the complete set of in-root directory paths from analyzed files and
   relevant declared unit paths, then create deterministic directory units.
5. Create direct filesystem directory-to-directory and directory/root-to-file
   containments.
6. Include the normalized workspace packages as structural units.
7. Create PNPM root-to-package and package-to-file containments from the
   normalized workspace views. Do not create package-to-directory shortcuts.
8. Compute source reports from facts the builder can prove, including the
   always-reported analysis target.
9. Preserve `packages`, `fileMemberships`, and workspace-specific
   `unassignedFileIds` as compatibility views.
10. Build any query indexes outside the serializable public object, following
    the current `WeakMap` pattern.

`buildProjectGraph(analysis)` remains an independent operation. It does not
consume the new structural units or containments, and the structure builder
does not mutate `AnalysisResult` or `ProjectGraph`.

## Evidence policy

This phase models facts only, so it does not add `basis` or `confidence` to
directory units or containment relations. Analysis-target provenance is
minimal as well: the file reference and its presence in `analysis.files` are
sufficient evidence of selection.

For filesystem facts, the minimal evidence is already reconstructible:

- the directory's normalized `rootPath`;
- the child's directory path or analyzed file path;
- the relation source `filesystem`.

The model must not duplicate arrays of descendant files into each directory or
relation. For `src/auth/auth.service.ts`, the directory path, file path, and
source are sufficient deterministic evidence.

Declared structure is different. `WorkspacePackage.evidence` continues to
preserve its current explicit PNPM provenance:

- workspace configuration path;
- matched workspace pattern;
- package manifest path.

The package-to-file relation can point to the existing package and membership
facts; it does not duplicate the package evidence on every relation.

If a future structural source is heuristic, its design must explicitly define
basis, confidence, and evidence before entering `ProjectStructure`. That future
possibility does not justify adding optional heuristic fields to factual units
now.

## Source-report semantics

`sourceReports` explains the status of each currently known source without
requiring the Explorer to infer meaning from empty arrays.

### Analysis target

The root and analyzed file list are mandatory current `AnalysisResult` facts,
so the analysis-target source report is always `reported`. This state makes no
claim about filesystem location or architectural meaning; it only confirms
that the builder received an analyzed target and its selected file set.

### Filesystem

The graph-engine always evaluates filesystem subdivision from
`analysis.files` and relevant declared unit paths, so it can prove one of two
states:

- `subdivision-detected`: at least one directory unit was derived below the
  analysis root;
- `no-subdivision`: no directory unit was derivable, including the case where
  analyzed files exist only directly at the root or there are no paths that
  induce a subdirectory.

`no-subdivision` does not mean “the project has no structure.” It states only
that the currently available factual paths produce no directory subdivision
below the analysis root. Root-level files still have direct filesystem
containments from the root.

### PNPM workspace

The graph-engine does not discover PNPM workspaces. It may state only what the
`AnalysisResult` reports:

- `reported`: `analysis.structure` is present. Packages and memberships may be
  empty; the status only says that a declared-structure payload was supplied;
- `not-reported`: `analysis.structure` is absent. This makes no claim that PNPM
  was evaluated, absent, unsupported, or undetectable.

The status names `not-detected` and `unsupported` are intentionally excluded
from the immediate model. The current input cannot prove them.

If a future analyzer explicitly reports that it evaluated a recognized source
or that a source is unsupported, a later contract decision may introduce a
source-assessment payload with provenance. Until then, the graph-engine and UI
must not infer those states from absence. No new `AnalysisResult` metadata is
required by this phase.

Source reports are informational facts, not warnings or diagnostics. In
particular, absence of workspace facts is normal for a single TypeScript
project.

## Absence and insufficiency semantics

The model distinguishes the required cases as follows:

1. **All analyzed files are directly at the root.** The root unit exists,
   root-to-file analysis-target and filesystem containments exist, and the
   filesystem source report is `no-subdivision`.
2. **Files are outside every workspace package.** They appear in
   `unassignedFileIds` and have no PNPM package-to-file containment. Their
   filesystem containment is independent and may be complete.
3. **No declared workspace facts were supplied.** The PNPM source report is
   `not-reported`; this is not a warning and does not assert that workspace
   detection ran.
4. **A declared-structure payload was supplied but is empty.** The PNPM source
   report is `reported`, the workspace views are empty, and all analyzed files
   are workspace-unassigned. The builder does not reinterpret why it is empty.
5. **A future recognized source is unsupported.** This cannot be represented as
   a proven state today. It requires explicit future analyzer metadata and is
   not synthesized by the graph-engine.
6. **An individual workspace membership is invalid.** It is omitted from both
   the compatibility membership view and the generic PNPM containments, as in
   the current tolerant snapshot behavior. The file remains
   workspace-unassigned.
7. **An analyzed file is outside the analysis-root filesystem path.** It remains
   represented by analysis-target containment but receives no false filesystem
   parent under the root. This is not the same as workspace assignment.

The presentation wording for these facts belongs to a future projection/UI
task. The core semantics are sufficient to support wording equivalent to “no
subdivision was derived from the currently available supported sources”
without claiming that the project itself lacks structure.

## Compatibility strategy

### `AnalysisResult` and Snapshot V1

- No directory units or containments are added to `AnalysisResult`.
- `schemaVersion` remains `1` for this phase.
- Existing snapshots are accepted because the new structure is derived from
  fields already present: `files[].path` and optional declared workspace facts.
- The builder does not mutate or rewrite the snapshot.
- A concrete incompatibility discovered during implementation is a blocker to
  report, not permission to change Snapshot V1 silently.

### Workspace contracts and views

- `WorkspacePackage` retains its identity, `rootPath`, optional `name`,
  `origin`, evidence, and stable IDs.
- `FileWorkspacePackageMembership` remains the analyzer-provided declared
  membership contract.
- `ProjectStructure.packages`, `fileMemberships`, and `unassignedFileIds`
  remain public compatibility views.
- The generic workspace units and PNPM containments are built from the same
  normalized packages and valid memberships used by those views. They cannot
  apply an independent validation rule.
- `buildProjectStructure()` owns one normalized workspace intermediate and
  emits both the generic facts and compatibility views from it; the two public
  shapes are not independent sources of truth.
- During this compatibility period, serialized `ProjectStructure` may repeat
  workspace package data in `units` and `packages`. This temporary duplication
  is preferable to a breaking removal. In memory, implementations should reuse
  the same immutable package objects where practical.
- A later removal of the compatibility fields requires a separately approved
  breaking migration; it is not part of this phase.

`unassignedFileIds` is explicitly workspace-specific. A BunkerMode file may be
fully reachable from the analysis root through directories and still remain in
`unassignedFileIds` because it has no workspace package membership.

### Existing graph-engine APIs

These APIs preserve their current signatures and behavior:

- `getWorkspacePackages()`;
- `getWorkspacePackage()`;
- `getWorkspacePackageForFile()`;
- `getFilesInWorkspacePackage()`;
- `aggregatePackageDependencies()`.

`PackageDependency` remains exclusively an aggregation between workspace
packages. Directory units do not participate in it, and filesystem
containments do not create package dependencies.

New generic structure queries may be added only as required by the future
implementation and its tests. They must not replace the workspace APIs in this
phase.

### Explorer

No visual change is part of this implementation. The current Explorer may
continue to use:

```text
SYSTEM -> WORKSPACE PACKAGE -> FILE
```

when `structure.packages` is non-empty, and its current file-level fallback
when no workspace packages exist. If expanded `ProjectStructure` types require
compile adaptations, those adaptations must preserve identical visual and
navigation behavior.

Directory units prepare factual input for a later projection decision. The
Explorer must not render `SYSTEM -> DIRECTORY -> FILE`, introduce territories,
or interpret directory names in this phase.

### ProjectGraph

`ProjectGraph` is unchanged. Directory and workspace containment cannot become:

- graph nodes;
- dependency edges;
- unresolved graph relations;
- synthetic relationships used by impact, cycles, metrics, or diagnostics.

A regression must compare `buildProjectGraph()` output for the same fixed
`AnalysisResult` against a pre-change expected result and prove exact equality.

## BunkerMode example

For `../BunkerMode/api`, the future structure contains one root, 12 directory
units derived from the 46 analyzed paths, and filesystem containments that make
all 46 files reachable from the root. Each file also has the parallel
analysis-target selection relation:

```text
analysis-root:.
├── directory:src
│   ├── file:src/app.module.ts
│   ├── file:src/health.controller.ts
│   ├── file:src/main.ts
│   ├── directory:src/auth
│   ├── directory:src/calendar
│   ├── directory:src/common
│   ├── directory:src/config
│   ├── directory:src/dreams
│   ├── directory:src/goals
│   ├── directory:src/missions
│   ├── directory:src/mountain
│   ├── directory:src/prisma
│   └── directory:src/reviews
└── directory:test
```

The exact observed directory paths are:

```text
src
src/auth
src/calendar
src/common
src/config
src/dreams
src/goals
src/missions
src/mountain
src/prisma
src/reviews
test
```

No directory receives an architectural role. In particular, `auth` is not
automatically a domain, feature, or NestJS module.

Because the analysis supplies no current workspace structure:

- `packages` remains empty;
- `fileMemberships` remains empty;
- all 46 file IDs remain in the workspace-specific `unassignedFileIds`;
- the filesystem source report is `subdivision-detected`;
- the PNPM source report is `not-reported`.

The existing Explorer may still open at file level until a later visual phase.

## BunkerCode example

For the BunkerCode workspace, directory containment and declared workspace
containment coexist.

The filesystem axis includes paths induced by analyzed files and package roots,
conceptually including:

```text
analysis-root:.
├── directory:apps
│   ├── directory:apps/cli
│   └── directory:apps/explorer-web
└── directory:packages
    ├── directory:packages/contracts
    ├── directory:packages/analyzer-typescript
    └── directory:packages/graph-engine
```

Deeper directories such as `apps/cli/src` and
`packages/graph-engine/src` are also present when induced by analyzed file
paths. The list above illustrates the shared paths rather than truncating the
core hierarchy.

In parallel, the current five workspace-package units remain:

```text
workspace-package:apps/cli
workspace-package:apps/explorer-web
workspace-package:packages/contracts
workspace-package:packages/analyzer-typescript
workspace-package:packages/graph-engine
```

For example, `directory:packages/analyzer-typescript` and
`workspace-package:packages/analyzer-typescript` are distinct units with the
same `rootPath`. The root has a filesystem containment to the directory axis
and a PNPM containment to the package axis. There is no synthetic
workspace-package-to-directory relation.

All current valid package-to-file memberships, package query results, five
package identities, and aggregated package dependencies remain unchanged.
The current Explorer therefore continues to open its workspace System map.

## Migration strategy

The future implementation is additive at the `ProjectStructure` boundary:

1. Extend the graph-engine `ProjectStructure` contract with the explicit root,
   generic units, containments, and source reports.
2. Keep the shared analyzer contracts unchanged unless implementation proves a
   concrete blocker.
3. Preserve the current workspace normalization first, then derive generic
   workspace units/relations from that same normalized result.
4. Derive directory units and filesystem containments from existing paths in
   graph-engine.
5. Retain current workspace query indexes and add only the minimal generic
   indexing needed for structural verification.
6. Adapt direct `ProjectStructure` test literals and Explorer compile points to
   the additive fields while preserving their behavior.
7. Verify exact compatibility of workspace APIs, package aggregation,
   `ProjectGraph`, Snapshot V1, CLI determinism, and existing Explorer
   projection.
8. Run real BunkerMode and BunkerCode analysis gates before completion.

This is a contract migration inside graph-engine, not a redesign of the
analyzer, graph, CLI result envelope, or Explorer navigation.

## Test strategy

Tests should extend the existing graph/analyzer/CLI/Explorer boundaries rather
than create speculative infrastructure. Each regression protects an observable
structural or compatibility invariant.

### Core structure matrix

1. **Simple project without subdirectories:** root unit exists, every file is
   directly contained by it, no directory unit exists, and filesystem status is
   `no-subdivision`.
2. **Nested directories:** all path-induced directory levels exist, direct
   parent relations are correct, and files are reachable from the root.
3. **File directly at the analysis root:** the file has a direct filesystem
   containment from the root even when other files are nested.
4. **PNPM workspace with internal directories:** the filesystem and PNPM axes
   coexist; package membership remains exact.
5. **Empty package:** its declared package unit and path-induced directory
   units exist even with no analyzed files; workspace file queries remain
   empty.
6. **Same `rootPath`:** a directory unit and workspace-package unit coexist
   with distinct IDs/kinds and no synthetic package-to-directory relation.
7. **Invalid workspace membership:** a missing file or package reference is
   filtered from compatibility and generic PNPM relations; the existing valid
   membership remains.
8. **Absent declared workspace:** PNPM status is `not-reported`; packages and
   memberships are empty; `unassignedFileIds` retains all analyzed files even
   when directory containment exists.
9. **Determinism:** reordered equivalent input produces byte-equivalent
   serializable structure, including units, relations, reports, and compatibility
   views.
10. **Target-relative path outside the root:** the file remains reachable by
    analysis-target containment, but no false filesystem directory or relation
    is created below the root.

### Compatibility matrix

11. **Workspace APIs:** existing package lookups, file ownership lookups, and
    package file lists are unchanged for the controlled PNPM fixture.
12. **Package dependency aggregation:** the exact directed aggregation and
    supporting file edge IDs are unchanged; directories never participate.
13. **ProjectGraph isolation:** the same fixed `AnalysisResult` produces the
    exact pre-change graph nodes, edges, unresolved relations, ordering, and
    serialization.
14. **Snapshot V1 and CLI:** an old ordinary-project snapshot and an old
    workspace snapshot normalize successfully; enriched CLI output remains
    deterministic with additive `ProjectStructure` fields.
15. **Explorer compatibility:** workspace input still starts at the system
    scope, non-workspace input still starts at file overview, and current
    projections contain no directory nodes.

### Real-project gates

For `../BunkerMode/api`, when accessible:

- analyze exactly the selected TypeScript target without executing its code;
- confirm the observed 46 analyzed files remain unchanged;
- confirm the 12 listed directory units exist;
- confirm every analyzed file is reachable from `analysis-root:.` through the
  filesystem axis;
- confirm no workspace package or architectural role is invented;
- confirm workspace-specific `unassignedFileIds` still contains the 46 files;
- confirm `buildProjectGraph()` remains unchanged.

For the BunkerCode workspace:

- confirm all path-induced directory units are present;
- confirm the existing five workspace packages and their IDs/evidence remain;
- confirm file memberships and `unassignedFileIds` remain identical;
- confirm `aggregatePackageDependencies()` remains identical;
- confirm the Explorer retains its current system/package/file behavior;
- confirm `buildProjectGraph()` remains unchanged.

The exact total directory count for BunkerCode is derived from the analyzed
paths at implementation time and must not be hard-coded from an older
snapshot.

## Definition of Done for the future implementation

- `ProjectStructure` has an explicit analysis root.
- `ProjectStructure` supports generic structural units.
- Directory units are derived deterministically from analyzed file paths and
  relevant declared unit paths.
- Workspace packages remain supported with current IDs and evidence.
- Directory and workspace-package units can coexist at one `rootPath`.
- Analysis-target, filesystem, and PNPM containment sources remain
  distinguishable.
- BunkerMode exposes the 12 observed directory paths.
- All 46 BunkerMode files are structurally reachable from the analysis root.
- No architectural role is inferred from a directory name or framework.
- BunkerCode preserves its five workspace packages.
- Existing workspace memberships remain identical.
- `aggregatePackageDependencies()` remains identical.
- Existing specialized workspace APIs preserve behavior.
- `unassignedFileIds` retains its workspace-specific meaning.
- `ProjectGraph` output remains exactly unchanged for the same analysis.
- Snapshot V1 remains accepted without an incidental schema change.
- Files directly at the root are representable.
- A project without subdirectories has an explicit, provable filesystem source
  state and direct root-to-file containment.
- Missing workspace facts are reported neutrally as `not-reported`, without a
  warning or invented detection claim.
- Output is deterministic, normalized, serializable, and free of runtime-only
  indexes.
- The implementation contains no territory, UI, renderer, layout, framework,
  or architectural-role logic.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `git diff --check` passes.
- Real BunkerMode and BunkerCode reanalyses pass the gates above when both
  targets are accessible.

## Rejected approaches

- **Put directories in `AnalysisResult` now.** This duplicates derivable facts,
  couples analyzers to generic path-tree construction, and changes Snapshot V1
  without need.
- **Add containment to `ProjectGraph`.** This breaks the established meaning of
  nodes, edges, metrics, impact, and cycle detection.
- **Treat a package and matching directory as one unit.** This loses the
  distinction between declared PNPM evidence and filesystem existence.
- **Emit only visually useful directories.** The core cannot make that choice
  without presentation heuristics; doing so would discard facts.
- **Scan every directory.** This would include unrelated material and create
  performance, determinism, and trust-boundary problems.
- **Infer roles from names or frameworks.** A path is not evidence of domain,
  feature, layer, module, or business meaning.
- **Interpret an absent `analysis.structure` as “PNPM not detected” or
  “unsupported.”** The current contract does not prove either claim.
- **Redefine `unassignedFileIds`.** Changing it to mean “without any structural
  containment” would silently break existing workspace semantics and make the
  BunkerMode result misleading.
