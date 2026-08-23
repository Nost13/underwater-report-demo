import type {
  Condition,
  NicheInput,
  NicheType,
  Phase,
  ReportSection,
  ScopeTarget,
  ServiceKind,
  Side,
} from './types';

export const GENERAL_ZONES = ['FWD', 'FWD-MID', 'MID', 'MID-AFT', 'AFT'] as const;
export const GENERAL_SIDES = ['PORT', 'STBD', 'BOTTOM'] as const;
export const SIDELESS_COMPONENTS = new Set([
  'PROPELLER BLADE',
  'ROPE GUARD',
  'BOSS CAP',
  'TRANSDUCER',
  'STERN FRAME',
]);

const emptyCondition = (): Condition => ({ class: '', rating: '', detail: '' });
const cleanCondition = (): Condition => ({ class: 'CLEAN', rating: 'R0', detail: '' });

export const phasesFor = (service: ServiceKind): Phase[] =>
  service === 'INSPECTION' ? ['CURRENT'] : ['BEFORE', 'AFTER'];

export function defaultConditions(service: ServiceKind): Partial<Record<Phase, Condition>> {
  const conditions: Partial<Record<Phase, Condition>> = {};
  for (const phase of phasesFor(service)) {
    conditions[phase] = phase === 'AFTER' ? cleanCondition() : emptyCondition();
  }
  return conditions;
}

function targetId(
  area: ReportSection['area'],
  component: string,
  side?: Side,
  unit?: number,
): string {
  const upperComponent = component.trim().toUpperCase();
  return [area, upperComponent, side, unit ? String(unit).padStart(2, '0') : undefined]
    .filter(Boolean)
    .join('/');
}

function makeTarget(
  area: ScopeTarget['area'],
  component: string,
  side?: Side,
  unit?: number,
  services: ServiceKind[] = [],
): ScopeTarget {
  const upperComponent = component.trim().toUpperCase();
  return {
    id: targetId(area, upperComponent, side, unit),
    area,
    component: upperComponent,
    side,
    unit,
    services: [...services],
  };
}

function makeSection(target: ScopeTarget, service: ServiceKind): ReportSection {
  return {
    id: `${service}/${target.id}`,
    targetId: target.id,
    area: target.area,
    component: target.component,
    side: target.side,
    unit: target.unit,
    service,
    phases: phasesFor(service),
    conditions: defaultConditions(service),
  };
}

export function createGeneralTargets(): ScopeTarget[] {
  return GENERAL_ZONES.flatMap((zone) =>
    GENERAL_SIDES.map((side) => makeTarget('GENERAL', zone, side)),
  );
}

export function replaceTargetService(
  target: ScopeTarget,
  service: ServiceKind,
): ScopeTarget {
  return { ...target, services: [service] };
}

export function appendTargetService(
  target: ScopeTarget,
  service: ServiceKind,
): ScopeTarget {
  return target.services.includes(service)
    ? target
    : { ...target, services: [...target.services, service] };
}

export function removeTargetService(
  target: ScopeTarget,
  service: ServiceKind,
): ScopeTarget {
  return { ...target, services: target.services.filter((item) => item !== service) };
}

export function applyServicePreset(
  targets: ScopeTarget[],
  service: ServiceKind,
  predicate: (target: ScopeTarget) => boolean,
): ScopeTarget[] {
  return targets.map((target) => (
    predicate(target) && target.services.length === 0
      ? replaceTargetService(target, service)
      : target
  ));
}

export function createReportSections(targets: ScopeTarget[]): ReportSection[] {
  return targets.flatMap((target) =>
    target.services.map((service) => makeSection(target, service)),
  );
}

export function createGeneralSections(service: ServiceKind): ReportSection[] {
  return createReportSections(
    createGeneralTargets().map((target) => replaceTargetService(target, service)),
  );
}

function sideSafeType(component: string, type: NicheType): NicheType {
  if (!SIDELESS_COMPONENTS.has(component.trim().toUpperCase())) return type;
  if (type === 'SIDE') return 'SINGLE';
  if (type === 'SIDE_QUANTITY') return 'QUANTITY';
  return type;
}

export function createNicheTargets(input: NicheInput): ScopeTarget[] {
  const type = sideSafeType(input.component, input.type);
  const quantity = Math.max(1, Math.floor(input.quantity || 1));
  const sides: Array<Side | undefined> =
    type === 'SIDE' || type === 'SIDE_QUANTITY' ? ['PORT', 'STBD'] : [undefined];
  const units: Array<number | undefined> =
    type === 'QUANTITY' || type === 'SIDE_QUANTITY'
      ? Array.from({ length: quantity }, (_, index) => index + 1)
      : [undefined];

  return sides.flatMap((side) =>
    units.map((unit) => makeTarget('NICHE', input.component, side, unit, [input.service])),
  );
}

export function createNicheSections(input: NicheInput): ReportSection[] {
  return createReportSections(createNicheTargets(input));
}
