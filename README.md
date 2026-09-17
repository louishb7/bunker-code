# BunkerCode

> Map your system before changing it.

BunkerCode is an experimental developer tool for understanding TypeScript
backends before modifying them.

It analyzes a codebase and turns structural information, dependencies and
evidence-backed technical responsibilities into a navigable model of the
system.

The project is currently under active development. Its long-term goal is to
help developers answer questions such as:

- What are the main parts of this system?
- What technical responsibilities exist?
- Where does a behavior enter the application?
- Where are persistence, security and framework boundaries?
- How are different parts connected?
- What may be affected if a file changes?

BunkerCode does not replace the editor. It is intended to help build context
before opening and changing individual files.

## Current status

The current implementation can analyze supported TypeScript projects and PNPM
workspaces and expose the resulting information through a CLI and a browser
Explorer.

Today, BunkerCode provides:

- TypeScript project and PNPM workspace discovery
- analyzed file discovery
- static import and dependency extraction
- internal and external dependency classification
- unresolved dependency reporting
- dependency cycle detection
- direct and transitive file impact analysis
- structural containment and workspace package detection
- evidence-backed responsibility detection for selected NestJS and Prisma
  patterns
- a browser interface for navigating system structure, responsibilities and
  file relationships

Analysis is static and deterministic. BunkerCode does not execute the analyzed
application.

## Explorer

Start the Explorer with:

```bash
pnpm explorer .
