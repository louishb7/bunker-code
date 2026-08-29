import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import snapshot from './generated/analyzer-typescript.snapshot.json';
import { Explorer } from './explorer-app.js';
import { createExplorerRuntime, type ExplorerRuntimeState } from './explorer-runtime.js';
import { StatusScreen } from './explorer-shell.js';
import './styles.css';

function App() {
  const [runtime, setRuntime] = useState<ExplorerRuntimeState>({ kind: 'loading' });

  useEffect(() => {
    setRuntime(createExplorerRuntime(snapshot));
  }, []);

  if (runtime.kind === 'loading') {
    return <StatusScreen title="Loading snapshot" message="Preparing the structural explorer." />;
  }

  if (runtime.kind === 'invalid-snapshot') {
    return <StatusScreen title="Snapshot unavailable" message={runtime.message} />;
  }

  if (runtime.kind === 'empty-graph') {
    return <StatusScreen title="No files to explore" message="The loaded snapshot does not contain internal files." />;
  }

  return (
    <Explorer
      graph={runtime.graph}
      structure={runtime.structure}
      responsibilities={runtime.responsibilities}
      projectLabel={runtime.projectLabel}
    />
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Explorer root element not found.');
}

createRoot(root).render(<App />);
