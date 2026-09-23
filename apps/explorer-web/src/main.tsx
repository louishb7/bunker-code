import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import { WorkspaceApp } from './workspace-app.js';
import './styles.css';
import './design/design.css';

// Optional raw assets keep absent or malformed snapshots outside DESIGN's boot path.
const snapshots = import.meta.glob('./generated/*.snapshot.json', { query: '?raw', import: 'default' });
async function loadSnapshot(): Promise<unknown> {
  const load = snapshots['./generated/analyzer-typescript.snapshot.json'];
  if (!load) throw new Error('No snapshot available. Run pnpm explorer <project> to prepare OBSERVE.');
  const raw = await load();
  if (typeof raw !== 'string') throw new Error('Snapshot could not be read.');
  return JSON.parse(raw);
}
const root = document.getElementById('root');
if (!root) throw new Error('Workspace root element not found.');
createRoot(root).render(<WorkspaceApp loadSnapshot={loadSnapshot} />);
