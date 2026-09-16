# BunkerCode

> Map your system before changing it.

BunkerCode is a local-first tool for investigating TypeScript project structure,
static dependencies, architectural diagnostics, and potential file-level change
impact. Analysis runs locally without executing the analyzed application's code
or requiring AI, an account, or code uploads.

## Setup

Use Node.js 24 and PNPM 11 (the exact package manager version is pinned in
`package.json`). From the repository root:

```bash
pnpm install --frozen-lockfile
```

## Analyze a project

```bash
pnpm --silent analyze fixtures/simple-import
pnpm --silent analyze .
pnpm --silent impact fixtures/simple-import src/service.ts
```

`analyze` accepts a TypeScript project with a `tsconfig.json` or a PNPM workspace.
It writes deterministic JSON containing `analysis`, `graph`, `diagnostics`,
`structure`, and `packageDependencies`. Workspace packages without their own
TypeScript configuration remain structurally visible but contribute no analyzed
TypeScript files. Unresolved relations remain explicit.

`impact` reports direct and transitive dependents, propagation depth, shortest
impact paths, and factual circularity evidence. This describes potential static
impact, not observed runtime behavior. Invalid input or analysis failures produce
an error on `stderr` and a non-zero exit code; JSON goes to `stdout`.

## Explorer

```bash
pnpm explorer .
pnpm explorer ../another-local-project
```

Without an argument, the Explorer analyzes BunkerCode itself. Paths resolve from
the invoking directory. If a repository root is not directly supported, discovery
searches below that root: one supported project is selected, while zero or
multiple candidates produce an explicit error. Dependencies of the target are
not installed automatically.

The browser provides:

- **Overview:** a structural System Map with region refinement, camera focus,
  file landmarks, and dependency evidence. Relations are hidden at rest;
  selection reveals incident relations, and **All dependencies** reveals all.
- **Territory:** navigation through factual directories, workspace packages,
  and files, with direct file connections and path search.
- **Responsibility:** a separate perspective for supported, evidence-backed
  findings from the implemented NestJS and Prisma detectors. Coverage limits
  are explicit; missing findings do not imply missing responsibilities.

Positions derive from containment rather than dependency counts or importance.
Relationships retain the direction **source uses target** and their original
locations and confidence. Refining the current Overview can reflow siblings;
large or deeply refined maps can require regional camera focus.

Snapshots are disposable and generated locally under
`apps/explorer-web/src/generated/` (ignored by Git). Regenerate them by restarting
the Explorer after source changes. No runtime tracing, historical Git analysis,
semantic impact, or remote persistence is provided.

## Architecture

- `packages/contracts`: serializable analysis and responsibility contracts.
- `packages/analyzer-typescript`: static extraction and module resolution using
  TypeScript/ts-morph, plus supported responsibility detectors.
- `packages/graph-engine`: dependency graph, containment, diagnostics, and impact.
- `apps/cli`: command arguments and JSON output.
- `apps/explorer-web`: React/React Flow presentation, built with Vite.

Containment and dependencies remain separate facts. AST library objects do not
cross the analyzer's public boundary. The browser reconstructs graph and
structure from the generated snapshot.

## Validation and build

```bash
pnpm typecheck
pnpm test
pnpm test:browser
pnpm --filter @bunker-code/explorer-web build
```

Browser tests use system Firefox at `/usr/bin/firefox`; override with
`BUNKERCODE_BROWSER_EXECUTABLE`. The regular suite skips browser-gated checks
unless enabled. The Web build generates a fresh local snapshot before bundling.
