import { analyzeProject } from '@bunker-code/analyzer-typescript';

function main(argv: string[]): number {
  const [projectPath] = argv;

  if (!projectPath) {
    console.error('Usage: pnpm analyze <project-path>');
    return 1;
  }

  try {
    const result = analyzeProject(projectPath);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
