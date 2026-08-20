import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeProject } from '@bunker-code/analyzer-typescript';
import {
  aggregatePackageDependencies,
  buildProjectGraph,
  buildProjectStructure,
  createImpactReport,
  createProjectDiagnostics,
} from '@bunker-code/graph-engine';

export interface CliStreams {
  writeStdout(output: string): void;
  writeStderr(output: string): void;
}

const processStreams: CliStreams = {
  writeStdout: (output) => {
    process.stdout.write(output);
  },
  writeStderr: (output) => {
    process.stderr.write(output);
  },
};

export function run(argv: readonly string[], streams: CliStreams = processStreams): number {
  const [commandOrProjectPath, ...rest] = argv;

  if (!commandOrProjectPath) {
    streams.writeStderr(usage());
    return 1;
  }

  if (commandOrProjectPath === 'analyze') {
    return runAnalyze(rest, streams);
  }

  if (commandOrProjectPath === 'impact') {
    return runImpact(rest, streams);
  }

  if (argv.length !== 1) {
    streams.writeStderr(usage());
    return 1;
  }

  return runAnalyze([commandOrProjectPath], streams);
}

function runAnalyze(argv: readonly string[], streams: CliStreams): number {
  const [projectPath] = argv;

  if (!projectPath || argv.length !== 1) {
    streams.writeStderr('Usage: pnpm analyze <project-path>\n');
    return 1;
  }

  try {
    const analysis = analyzeProject(projectPath);
    const graph = buildProjectGraph(analysis);
    const diagnostics = createProjectDiagnostics(graph);
    const structure = buildProjectStructure(analysis);
    const packageDependencies = aggregatePackageDependencies(graph, structure);

    streams.writeStdout(`${JSON.stringify({ analysis, graph, diagnostics, structure, packageDependencies }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    streams.writeStderr(`${message}\n`);
    return 1;
  }
}

function runImpact(argv: readonly string[], streams: CliStreams): number {
  const [projectPath, targetPath] = argv;

  if (!projectPath || !targetPath || argv.length !== 2) {
    streams.writeStderr('Usage: pnpm impact <project-path> <project-relative-file-path>\n');
    return 1;
  }

  try {
    const analysis = analyzeProject(projectPath);
    const graph = buildProjectGraph(analysis);
    const report = createImpactReport(graph, normalizeRelativeFilePath(targetPath));

    streams.writeStdout(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    streams.writeStderr(`${message}\n`);
    return 1;
  }
}

function normalizeRelativeFilePath(filePath: string): string {
  const normalized = path.posix.normalize(filePath.replaceAll('\\', '/'));

  return normalized.replace(/^(\.\/)+/, '');
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm analyze <project-path>',
    '  pnpm impact <project-path> <project-relative-file-path>',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
