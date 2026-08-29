import type { ResponsibilityDetector } from './detector.js';
import { decoratorFor, decoratorKey, evidenceFor, findingFor, nestAliases, nestApplicable, subjectFor } from './nestjs-common.js';

const routeDecorators = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);

export const nestjsHttpDetector: ResponsibilityDetector = { detector: { id: 'nestjs.http', version: '1' }, capability: 'http-entry-point', analyze(session) {
  if (!nestApplicable(session)) return { status: 'not-applicable', findings: [], limitations: [] };
  const findings = [];
  for (const sourceFile of session.sourceFiles.values()) { const aliases = nestAliases(sourceFile); for (const klass of sourceFile.getClasses()) { const controller = decoratorFor(klass, aliases, 'Controller'); if (!controller) continue; for (const method of klass.getMethods()) { const route = method.getDecorators().find((item) => routeDecorators.has(aliases.get(decoratorKey(item)) ?? '')); if (route) findings.push(findingFor(subjectFor(session, method), 'http-entry-point', this.detector, 'nestjs-controller-route', [evidenceFor(session, controller), evidenceFor(session, route)])); } } }
  return { status: 'evaluated', findings, limitations: [] };
} };

export const nestjsAccessDetector: ResponsibilityDetector = { detector: { id: 'nestjs.access-control', version: '1' }, capability: 'access-control', analyze(session) {
  if (!nestApplicable(session)) return { status: 'not-applicable', findings: [], limitations: [] };
  const findings = [];
  for (const sourceFile of session.sourceFiles.values()) { const aliases = nestAliases(sourceFile); for (const klass of sourceFile.getClasses()) { const classGuard = decoratorFor(klass, aliases, 'UseGuards'); if (classGuard) findings.push(findingFor(subjectFor(session, klass), 'access-control', this.detector, 'nestjs-use-guards', [evidenceFor(session, classGuard)])); for (const method of klass.getMethods()) { const guard = decoratorFor(method, aliases, 'UseGuards'); if (guard) findings.push(findingFor(subjectFor(session, method), 'access-control', this.detector, 'nestjs-use-guards', [evidenceFor(session, guard)])); } } }
  return { status: 'evaluated', findings, limitations: [] };
} };

export const nestjsWiringDetector: ResponsibilityDetector = { detector: { id: 'nestjs.framework-wiring', version: '1' }, capability: 'framework-wiring', analyze(session) {
  if (!nestApplicable(session)) return { status: 'not-applicable', findings: [], limitations: [] };
  const findings = [];
  for (const sourceFile of session.sourceFiles.values()) { const aliases = nestAliases(sourceFile); for (const klass of sourceFile.getClasses()) { const module = decoratorFor(klass, aliases, 'Module'); if (module) findings.push(findingFor(subjectFor(session, klass), 'framework-wiring', this.detector, 'nestjs-module', [evidenceFor(session, module)])); } }
  return { status: 'evaluated', findings, limitations: [] };
} };
