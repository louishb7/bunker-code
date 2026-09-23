import { buildDesignerScene, shortLabel } from './designer-scene.js';
import { parseDesignerDocument, type DesignerDocument } from './designer-storage.js';

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '�').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function lines(value: string, length: number): string[] {
  const chars = Array.from(value);
  if (chars.length <= length) return [value];
  let end = chars.lastIndexOf(' ', length);
  if (end < length / 2) end = length;
  return [chars.slice(0, end).join(''), shortLabel(chars.slice(end).join('').trim(), length)];
}

/** Standalone vector output: no DOM capture, remote assets, scripts or foreignObject. */
export function exportDesignerSVG(document: DesignerDocument): string {
  const valid = parseDesignerDocument(JSON.stringify(document));
  const scene = buildDesignerScene(valid.model, valid.presentation, valid.implementation);
  if (!scene.parts.length) throw new TypeError('Add a Part before exporting the canvas.');
  const { width, height } = scene.partSize;
  const left = Math.min(...scene.parts.map((part) => part.position.x), ...scene.relations.map((edge) => edge.bounds.left)) - 40;
  const top = Math.min(...scene.parts.map((part) => part.position.y), ...scene.relations.map((edge) => edge.bounds.top)) - 80;
  const right = Math.max(...scene.parts.map((part) => part.position.x + width), ...scene.relations.map((edge) => edge.bounds.right)) + 40;
  const bottom = Math.max(...scene.parts.map((part) => part.position.y + height), ...scene.relations.map((edge) => edge.bounds.bottom)) + 40;
  const lens = valid.presentation.lens === 'implementation';
  const edges = scene.relations.map((edge) => `<g><title>${xml(edge.label)}</title><path d="${edge.path}" fill="none" stroke="#89a6b2" stroke-width="1.7" marker-end="url(#arrow)"/>${edge.labelOffset ? `<path d="M ${edge.x} ${edge.y} L ${edge.x} ${edge.labelY}" stroke="#89a6b2" stroke-dasharray="3 3"/>` : ''}<rect x="${edge.x - Math.min(190, edge.label.length * 7 + 20) / 2}" y="${edge.labelY - 13}" width="${Math.min(190, edge.label.length * 7 + 20)}" height="26" rx="5" fill="#10242e" stroke="#4b666f"/><text x="${edge.x}" y="${edge.labelY + 4}" text-anchor="middle" font-size="12" fill="#c3d6db">${xml(shortLabel(edge.label, 25))}</text></g>`).join('');
  const parts = scene.parts.map((part) => `<g transform="translate(${part.position.x} ${part.position.y})"><title>${xml(part.label + (lens && part.technologies.length ? ' — ' + part.technologies.join(', ') : ''))}</title><rect width="${width}" height="${height}" rx="9" fill="#1a303a" stroke="#7fc7b4"/><text x="18" y="26" font-size="9" letter-spacing="1.2" fill="#8fc9b9">PART</text>${lines(part.label, 23).map((line, index) => `<text x="18" y="${49 + index * 19}" font-size="15" font-weight="600" fill="#e0ecef">${xml(line)}</text>`).join('')}${lens ? `<path d="M 18 80 H 202" stroke="#3a555d"/>${part.badges.length ? part.badges.map((badge) => `<g><rect x="${badge.x}" y="${badge.y}" width="${badge.width}" height="20" rx="4" fill="#244740" stroke="#50796c"/><text x="${badge.x + 8}" y="${badge.y + 14}" font-size="11" fill="#c2ebda">${xml(badge.text)}</text></g>`).join('') : '<text x="18" y="108" font-size="11" fill="#9bb1bb">No technologies chosen</text>'}` : `<text x="18" y="93" font-size="10" fill="#9bb1bb">${xml(shortLabel(part.description ?? '', 30))}</text>`}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(right - left)}" height="${Math.ceil(bottom - top)}" viewBox="${left} ${top} ${right - left} ${bottom - top}" role="img" aria-label="${xml(valid.model.context.representedSystem)}"><title>${xml(valid.model.context.representedSystem)} — ${lens ? 'Implementation' : 'Structure'}</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#89a6b2"/></marker></defs><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="#0e1a21"/><g font-family="Arial, sans-serif"><text x="${left + 28}" y="${top + 32}" font-size="18" font-weight="600" fill="#e0ecef">${xml(valid.model.context.representedSystem)}</text><text x="${left + 28}" y="${top + 54}" font-size="11" fill="#9bb1bb">${lens ? 'Implementation · Planned technology choices' : 'Structure · Planned Parts and Relations'}</text>${edges}${parts}</g></svg>`;
}
