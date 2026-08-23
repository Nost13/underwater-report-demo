import type {
  Condition,
  NicheInput,
  NicheType,
  Phase,
  ReportSection,
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

function makeSection(
  area: ReportSection['area'],
  component: string,
  service: ServiceKind,
  side?: Side,
  unit?: number,
): ReportSection {
  const upperComponent = component.trim().toUpperCase();
  const id = [area, upperComponent, side, unit ? String(unit).padStart(2, '0') : undefined]
    .filter(Boolean)
    .join('/');
  return {
    id,
    area,
    component: upperComponent,
    side,
    unit,
    service,
    phases: phasesFor(service),
    conditions: defaultConditions(service),
  };
}

export function createGeneralSections(service: ServiceKind): ReportSection[] {
  return GENERAL_ZONES.flatMap((zone) =>
    GENERAL_SIDES.map((side) => makeSection('GENERAL', zone, service, side)),
  );
}

function sideSafeType(component: string, type: NicheType): NicheType {
  if (!SIDELESS_COMPONENTS.has(component.trim().toUpperCase())) return type;
  if (type === 'SIDE') return 'SINGLE';
  if (type === 'SIDE_QUANTITY') return 'QUANTITY';
  return type;
}

export function createNicheSections(input: NicheInput): ReportSection[] {
  const type = sideSafeType(input.component, input.type);
  const quantity = Math.max(1, Math.floor(input.quantity || 1));
  const sides: Array<Side | undefined> =
    type === 'SIDE' || type === 'SIDE_QUANTITY' ? ['PORT', 'STBD'] : [undefined];
  const units: Array<number | undefined> =
    type === 'QUANTITY' || type === 'SIDE_QUANTITY'
      ? Array.from({ length: quantity }, (_, index) => index + 1)
      : [undefined];

  return sides.flatMap((side) =>
    units.map((unit) => makeSection('NICHE', input.component, input.service, side, unit)),
  );
}
