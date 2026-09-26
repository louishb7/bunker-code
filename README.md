# BunkerCode

> Map your system before changing it.

BunkerCode is a local workspace for designing systems before code exists and understanding TypeScript backends before modifying them.

It analyzes a codebase and turns structural information, dependencies and evidence-backed technical responsibilities into a navigable model of the system.

The project is currently under active development.

Its long-term goal is to help developers answer questions such as:

- What are the main parts of this system?
- What technical responsibilities exist?
- Where does a behavior enter the application?
- Where are persistence, security and framework boundaries?
- How are different parts connected?
- What may be affected if a file changes?

BunkerCode does not replace the editor. It is intended to help build context before opening and changing individual files.

## Current status

The workspace has two independent areas: **DESIGN** authors planned systems from human intent; **OBSERVE** explores facts from supported TypeScript projects and PNPM workspaces. The CLI continues to provide static analysis.

Today, BunkerCode provides:

- TypeScript project and PNPM workspace discovery
- analyzed file discovery
- static dependency extraction
- internal and external dependency classification
- unresolved dependency reporting
- dependency cycle detection
- direct and transitive impact analysis
- structural containment and workspace package detection
- evidence-backed responsibility detection for selected NestJS and Prisma patterns
- a browser interface for navigating system structure, responsibilities and file relationships

Analysis is static and deterministic. BunkerCode does not execute the analyzed application.

## DESIGN (Studio V1)

Run `pnpm design` to open the semantic-first Studio in Brazilian Portuguese.
Double-click empty space, choose a human-readable action, name the concept and
press Enter. Technical terms remain visible as secondary vocabulary. The empty
canvas offers brief, optional guidance; `Conceitos` is a quick reference.
Connect two concepts to record a relationship; its meaning is optional.
Selection shows an information card before any edit form. Details, decisions,
considerations and System Context open only when requested.

Architectural entities and relationships are the source of truth in
`design-model`. Node positions and viewport live in a separate layout document;
React Flow provides canvas interaction, not the product model. Both documents
are saved locally under a Studio V1 key. The Excalidraw Studio V0 was a
discardable experiment and is not migrated. Refresh the same browser origin to
continue. DESIGN does not yet connect to OBSERVE.

`pnpm explorer` continues to run the current OBSERVE surface, including its
legacy DESIGN area. The new Studio does not alter Explorer analysis.

**BunkerCode DESIGN — frozen checkpoint.** Studio V1 is functional and
beginner-friendly in PT-BR; the analyzer and OBSERVE remain available. Product
development is deliberately paused while practical experience grows in backend
architecture, APIs, databases, queues, workers, cache, concurrency, consistency,
idempotency, observability, scaling and system design. Open questions about the
amount of guidance, how constraints affect considerations, DESIGN/OBSERVE
convergence, model export, documentation, AI-agent context and architectural
drift are recorded without implementation commitments.

## OBSERVE / Explorer

Start the Explorer with:

```bash
pnpm explorer .
```

Or analyze another local project:

```bash
pnpm explorer ../another-local-project
```

Without an argument, this command analyzes BunkerCode itself. Choose **OBSERVE**
in the workspace header to open the Explorer. If analysis fails, the workspace
still opens with DESIGN available and OBSERVE reports the missing snapshot.

The Explorer currently exposes three complementary views.

### Overview

Overview presents the analyzed system at the highest available scale.

It combines:

- major structural regions
- workspace package relationships
- detected technical responsibilities
- structural observations
- external module usage

The purpose of this view is orientation: provide enough context to understand what kind of system was analyzed before navigating into individual files.

### Responsibility

Responsibility groups evidence-backed findings by technical role.

The current detectors support selected patterns such as:

- NestJS HTTP entry points
- NestJS access-control boundaries
- NestJS framework wiring
- Prisma persistence interactions

Responsibility findings are backed by source evidence.

Unsupported or unevaluated capabilities are reported explicitly rather than inferred from directory or file names.

This area is still evolving and does not attempt to classify every architectural role present in a project.

### Territory

Territory represents factual structural containment.

It allows navigation through:

- directories
- PNPM workspace packages
- analyzed files
- direct file relationships

Territory answers where something exists in the codebase.

Responsibility answers what supported technical role it performs.

These are treated as separate dimensions of the system.

## File relationships

BunkerCode models static dependency direction as:

```text
A -> B
```

meaning:

```text
A uses B
```

The Explorer preserves the original dependency evidence and allows a file to be inspected together with its direct connections.

Impact analysis can also identify transitive dependents to help estimate which other files may require review before a change.

This represents potential static impact, not observed runtime behavior.

## CLI

Analyze a project:

```bash
pnpm --silent analyze fixtures/simple-import
pnpm --silent analyze .
```

Inspect potential impact from a file:

```bash
pnpm --silent impact fixtures/simple-import src/service.ts
```

`analyze` accepts a supported TypeScript project with a `tsconfig.json` or a PNPM workspace.

The generated JSON contains structural analysis, dependency information, diagnostics and project structure.

`impact` reports direct and transitive dependents, propagation depth, impact paths and circularity information.

Invalid input or analysis failures are written to `stderr` and return a non-zero exit code.

JSON output is written to `stdout`.

## Architecture

BunkerCode is organized as a PNPM workspace.

### `packages/contracts`

Serializable contracts shared between the analyzer, graph engine and presentation layers.

### `packages/analyzer-typescript`

TypeScript static analysis built with TypeScript and `ts-morph`.

It is responsible for:

- project discovery
- source-file analysis
- dependency extraction
- workspace detection
- supported responsibility detectors
- evidence collection

### `packages/graph-engine`

Builds and queries the project graph.

It currently provides:

- dependency graphs
- package dependencies
- structural containment
- cycle detection
- diagnostics
- direct and transitive impact analysis

### `packages/planned-system`

Creates, validates and edits authoritative Planned System Models without analyzer
or UI dependencies. Each authoring operation returns a valid detached model or
rejects the entire change; removal policies preserve reference integrity.

### `packages/design-model`

Independent Studio model for system context, entities, relationships, decisions
and deterministic consideration state. Layout is separate from semantic identity.

### `apps/cli`

Command-line interface for running analysis and impact operations.

### `apps/explorer-web`

Current OBSERVE Explorer with Overview, Responsibility and Territory. Its older
React Flow DESIGN area remains available as a legacy surface.

### `apps/studio-web`

Semantic-first DESIGN whiteboard using React Flow for interaction and the
separate `design-model` package for authored knowledge. Run with `pnpm design`.

## Analysis principles

BunkerCode separates different kinds of information.

### Structure

Where does something exist?

Derived from factual project and filesystem containment.

### Responsibility

What supported technical role does something perform?

Derived from explicit evidence such as framework annotations, known APIs and supported static patterns.

### Relationships

What does something depend on, and what depends on it?

Derived from static dependency analysis.

### Impact

What other analyzed files may need review if this file changes?

Derived from the dependency graph.

These dimensions should not be collapsed into a single arbitrary importance score.

BunkerCode also avoids treating names such as `controllers`, `services` or `repositories` as architectural truth by themselves.

## Product direction

The broader direction of BunkerCode is to turn an unfamiliar backend into a navigable mental model.

The intended investigation flow is:

```text
Map
  ↓
Locate
  ↓
Understand
  ↓
Trace
  ↓
Impact
```

The current implementation covers parts of this flow, but the product model and visualization are still being developed.

Future work is expected to improve how structural regions, technical responsibilities, relationships and change impact are combined into a single progressive exploration experience.

## Scope and limitations

BunkerCode currently focuses on static TypeScript analysis.

It does not currently provide:

- runtime tracing
- debugging or profiling
- historical Git analysis
- complete semantic change-impact analysis
- automatic architectural classification of arbitrary frameworks
- complete business-domain inference
- remote project storage

Missing responsibility findings do not prove that a responsibility does not exist.

They may simply mean that the current analyzer does not support the relevant pattern yet.

## Setup

Requirements:

- Node.js 24
- PNPM 11

The package manager version is pinned in `package.json`.

Install dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

## Validation

Run the regular checks with:

```bash
pnpm typecheck
pnpm test
pnpm test:browser
pnpm --filter @bunker-code/explorer-web build
pnpm build:design
```

The application build does not run analysis. It includes the generated OBSERVE
snapshot when present; run `pnpm --filter @bunker-code/explorer-web generate:snapshot`
before building if you want a fresh observed system. Studio builds without one.

The gated browser tests cover Studio, Explorer and the Explorer's legacy DESIGN area. They use Firefox by default at:

```text
/usr/bin/firefox
```

A different executable can be configured through:

```text
BUNKERCODE_BROWSER_EXECUTABLE
```

Explorer snapshots are generated locally under:

```text
apps/explorer-web/src/generated/
```

They are disposable and ignored by Git.

## Project status

BunkerCode is an experimental project in active development.

The current repository represents working infrastructure and ongoing product exploration rather than a finished developer tool.
