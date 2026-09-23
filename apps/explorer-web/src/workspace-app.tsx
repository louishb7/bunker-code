import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DesignApp } from './design/design-app.js';
const ObserveApp = lazy(() => import('./observe-app.js'));

class ObserveBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">OBSERVE could not open this snapshot. DESIGN remains available.</p> : this.props.children; }
}

export function WorkspaceApp({ loadSnapshot }: { loadSnapshot: () => Promise<unknown> }) {
  const [area, setArea] = useState(window.location.hash === '#observe' ? 'observe' : 'design');
  const designNavigationGuard = useRef<(() => boolean) | null>(null);
  const registerNavigationGuard = useCallback((guard: (() => boolean) | null) => { designNavigationGuard.current = guard; }, []);
  useEffect(() => {
    const change = () => {
      const next = window.location.hash === '#observe' ? 'observe' : 'design';
      if (area === 'design' && next === 'observe' && designNavigationGuard.current && !designNavigationGuard.current()) {
        window.history.replaceState(null, '', '#design');
        return;
      }
      setArea(next);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [area]);
  return <div className="bunker-workspace">
    <header className="workspace-header">
      <span className="product-wordmark"><span>B</span> BunkerCode</span>
      <nav aria-label="Workspace area">
        <a href="#design" aria-current={area === 'design' ? 'page' : undefined}>DESIGN</a>
        <a href="#observe" aria-current={area === 'observe' ? 'page' : undefined}>OBSERVE</a>
      </nav>
      <span className="workspace-purpose">{area === 'design' ? 'Human intent · Planned systems' : 'Code facts · Observed system'}</span>
    </header>
    <div className="workspace-content">
      {area === 'design' ? <DesignApp registerNavigationGuard={registerNavigationGuard} /> : <ObserveBoundary><Suspense fallback={<p>Opening OBSERVE…</p>}><ObserveApp loadSnapshot={loadSnapshot} /></Suspense></ObserveBoundary>}
    </div>
  </div>;
}
