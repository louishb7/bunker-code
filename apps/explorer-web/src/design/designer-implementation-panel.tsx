import { useState } from 'react';
import type { PlannedSystemModel, PlannedSubjectRef } from '@bunker-code/contracts';
import { assignTechnology, implementationStack, removeTechnology, technologiesForPart, technologyKey, technologySuggestions,
  unassignTechnology, type DesignImplementation } from './designer-implementation.js';

export type CommitImplementation = (operation: (value: DesignImplementation, model: PlannedSystemModel) => DesignImplementation) => boolean;
export function ImplementationPanel({ model, implementation, partId, commit, select }: {
  model: PlannedSystemModel; implementation: DesignImplementation; partId?: string;
  commit: CommitImplementation; select(subject: PlannedSubjectRef): void;
}) {
  const [query, setQuery] = useState('');
  const assigned = partId ? technologiesForPart(implementation, partId) : [];
  const labels = [...new Map([...technologySuggestions, ...implementation.technologies.map((item) => item.label)].map((label) => [technologyKey(label), label])).values()];
  const choices = labels.filter((label) => technologyKey(label).includes(technologyKey(query)) && !assigned.some((item) => technologyKey(item.label) === technologyKey(label))).slice(0, 8);
  const custom = query.trim() && !labels.some((label) => technologyKey(label) === technologyKey(query));
  const stack = implementationStack(implementation);
  function add(label: string) {
    if (partId && commit((value, currentModel) => assignTechnology(value, currentModel, partId, label, crypto.randomUUID()))) setQuery('');
  }
  function remove(id: string, label: string, count: number) {
    if (window.confirm(`Remove “${label}” from this system and its ${count} Part assignments? The Parts and Relations will remain. You can undo this.`)) commit((value, currentModel) => removeTechnology(value, currentModel, id));
  }
  return <section className="designer-implementation-panel" aria-label={partId ? 'Part implementation' : 'System technology stack'}>
    <h2>{partId ? model.parts.find((part) => part.id === partId)?.label : 'Technology stack'}</h2>
    <p className="designer-muted">{partId ? 'Planned tools for this Part. Its identity and connections stay independent of these choices.' : 'Derived from Part assignments. These are authored choices, not architecture recommendations.'}</p>
    {partId ? <>
      <div className="designer-assigned-technologies">
        {assigned.length === 0 && <p className="designer-muted">No technologies chosen. This Part is still a complete structural element.</p>}
        {assigned.map((item) => <div className="designer-assignment" key={item.id}><span className="designer-tech-chip">{item.label}</span><button aria-label={`Unassign ${item.label}`} title="Remove from this Part" onClick={() => commit((value, currentModel) => unassignTechnology(value, currentModel, partId, item.id))}>×</button></div>)}
      </div>
      <label className="designer-field">Add technology<input type="search" aria-label="Find technology" placeholder="Search or name your own…" value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); const first = choices[0]; if (first) add(first); else if (custom) add(query); }
      }} /></label>
      <div className="designer-technology-choices" aria-label="Technology suggestions">
        {choices.map((label) => <button key={technologyKey(label)} onClick={() => add(label)}><span>{label}</span><small>{implementation.technologies.some((item) => technologyKey(item.label) === technologyKey(label)) ? 'In this system' : 'Suggestion'} +</small></button>)}
        {custom && <button className="designer-custom-technology" onClick={() => add(query)}>+ Add “{query.trim()}”</button>}
        {!choices.length && !custom && <p className="designer-muted">Already assigned to this Part.</p>}
      </div>
      <p className="designer-muted designer-implementation-footnote">Suggestions are shortcuts, not a catalog of approved technologies. You can use any name.</p>
    </> : <>
      {stack.length === 0 && <p className="designer-muted">Select a Part and open Implementation to choose its technologies.</p>}
      {stack.map(({ technology, partIds }) => <article className="designer-stack-entry" key={technology.id}>
        <div><strong>{technology.label}</strong><button aria-label={`Remove technology ${technology.label}`} onClick={() => remove(technology.id, technology.label, partIds.length)}>Remove</button></div>
        <div className="designer-stack-parts">{partIds.map((id) => <button key={id} onClick={() => select({ kind: 'part', partId: id })}>{model.parts.find((part) => part.id === id)?.label}</button>)}</div>
      </article>)}
      {implementation.technologies.some((item) => !stack.some((entry) => entry.technology.id === item.id)) && <details className="designer-unused-technologies"><summary>Unused technologies</summary>
        {implementation.technologies.filter((item) => !stack.some((entry) => entry.technology.id === item.id)).map((item) => <div key={item.id}><span>{item.label}</span><button aria-label={`Remove technology ${item.label}`} onClick={() => remove(item.id, item.label, 0)}>Remove</button></div>)}
      </details>}
    </>}
  </section>;
}
