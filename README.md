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
PNPM workspace. When workspace structure is present, it opens with a System
Overview of detected workspace packages and their evidence-backed aggregated
dependencies. Selecting a package shows its provenance; **Open package** drills
down to the existing file-level Explorer, and the breadcrumb returns to System.

Generate the snapshot and start the local app:

```bash
pnpm --filter @bunker-code/explorer-web dev
```

Build the Web application with:

```bash
pnpm --filter @bunker-code/explorer-web build
```

The generated snapshot at `apps/explorer-web/src/generated/` is ignored by Git.
Source code remains the source of truth; regenerate the snapshot after analyzer
changes rather than treating it as persisted Explorer data. Its Web delivery
payload carries the `AnalysisResult` plus package dependencies already
aggregated by `graph-engine`; the browser consumes that fact and does not
reconstruct package relationships itself.

Within a package, the Explorer can find its internal files by path or file
name. Selecting a search result centers it; selecting a result outside the
current focus context returns to that package's file overview so the file is
visible before it is selected. Files from another workspace package appear only
as contextual file nodes when a cross-package dependency requires that context.
