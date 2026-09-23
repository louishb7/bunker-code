import { useEffect, useState } from 'react';
import { Explorer } from './explorer-app.js';
import { createExplorerRuntime, type ExplorerRuntimeState } from './explorer-runtime.js';
import { StatusScreen } from './explorer-shell.js';

export default function ObserveApp({ loadSnapshot }: { loadSnapshot: () => Promise<unknown> }) {
  const [runtime, setRuntime] = useState<ExplorerRuntimeState>({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    void loadSnapshot().then((snapshot) => {
      if (active) setRuntime(createExplorerRuntime(snapshot));
    }).catch((error: unknown) => {
      if (active) setRuntime({ kind: 'invalid-snapshot', message: error instanceof Error ? error.message : String(error) });
    });
    return () => { active = false; };
  }, [loadSnapshot]);
  if (runtime.kind === 'loading') return <StatusScreen title="Loading snapshot" message="Preparing the structural explorer." />;
  if (runtime.kind === 'invalid-snapshot') return <StatusScreen title="Snapshot unavailable" message={runtime.message} />;
  if (runtime.kind === 'empty-graph') return <StatusScreen title="No files to explore" message="The loaded snapshot does not contain internal files." />;
  return <Explorer graph={runtime.graph} structure={runtime.structure} responsibilities={runtime.responsibilities} projectLabel={runtime.projectLabel} />;
}
