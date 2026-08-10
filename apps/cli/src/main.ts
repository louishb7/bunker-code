import { pathToFileURL } from 'node:url';
import { analyzeProject } from '@bunker-code/analyzer-typescript';
import { buildProjectGraph, createProjectDiagnostics } from '@bunker-code/graph-engine';

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
  const [projectPath] = argv;

  if (!projectPath || argv.length !== 1) {
    streams.writeStderr('Usage: pnpm analyze <project-path>\n');
    return 1;
  }

  try {
    const analysis = analyzeProject(projectPath);
    const graph = buildProjectGraph(analysis);
    const diagnostics = createProjectDiagnostics(graph);

    streams.writeStdout(`${JSON.stringify({ analysis, graph, diagnostics }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    streams.writeStderr(`${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
