import type { ReportSection, ServiceKind } from '../domain/types';
import type { ReportInfo } from './reportInfo';
import { SERVICE_REPORT_LABELS } from './reportInfo';
import { GENERAL_ZONES, GENERAL_SIDES } from '../domain/structure';
import { MAIN_HULL_ORDER, SIDE_ORDER, SUMMARY_NICHE_ORDER } from '../summary/summaryModel';

export interface CoverCrop {
  focusX: number;
  focusY: number;
  zoom: number;
}

export interface CoverInfo {
  issueDate: string;
  photoFile: File | null;
  crop: CoverCrop;
  scopeTitle: string;
  scopeDescription: string;
  scopeMode: 'AUTO' | 'MANUAL';
}

export interface LinkedCoverValues {
  reportNo: string;
  vesselName: string;
  imoNumber: string;
  callSign: string;
  ownerClient: string;
  operationDate: string;
  location: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function localIsoDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCoverDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value.trim());
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(Date.UTC(Number(match[1]), month - 1, day));
  if (calendarCheck.getUTCFullYear() !== Number(match[1]) || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) return '';
  return `${day} ${MONTHS[month - 1]} ${match[1]}`;
}

export function createCoverInfo(now = new Date()): CoverInfo {
  return {
    issueDate: localIsoDate(now),
    photoFile: null,
    crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
    scopeTitle: '',
    scopeDescription: '',
    scopeMode: 'AUTO',
  };
}

export function linkedCoverValues(info: ReportInfo): LinkedCoverValues {
  return {
    reportNo: info.vessel.jobNo,
    vesselName: info.vessel.name,
    imoNumber: info.vessel.imo,
    callSign: info.vessel.callSign,
    ownerClient: info.vessel.ownerClient,
    operationDate: formatCoverDate(info.operation.start) || formatCoverDate(info.operation.eta),
    location: info.operation.location,
  };
}

function scopeEntries(sections: ReportSection[]): Array<{ service: ServiceKind; component: string; qualifier: string; index: number }> {
  const seen = new Set<string>();
  const entries: Array<{ service: ServiceKind; component: string; qualifier: string; index: number }> = [];
  const serviceOrder: ServiceKind[] = ['INSPECTION', 'CLEANING', 'POLISHING', 'REPAIR', 'REMOVAL'];
  const rank = (values: readonly string[], value?: string) => { const index = value ? values.indexOf(value) : -1; return index < 0 ? values.length : index; };
  const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const compareUnit = (left?: number, right?: number) => {
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return left - right;
  };
  const ordered = sections.map((section, index) => ({ section, index })).sort((left, right) => {
    const a = left.section; const b = right.section;
    const areaResult = rank(['GENERAL', 'NICHE'], a.area) - rank(['GENERAL', 'NICHE'], b.area);
    const componentResult = a.area === 'GENERAL'
      ? rank(GENERAL_ZONES, a.component.toUpperCase()) - rank(GENERAL_ZONES, b.component.toUpperCase())
        || compareText(a.component.trim().toUpperCase(), b.component.trim().toUpperCase())
      : rank(SUMMARY_NICHE_ORDER, a.component.toUpperCase()) - rank(SUMMARY_NICHE_ORDER, b.component.toUpperCase())
        || compareText(a.component.trim().toUpperCase(), b.component.trim().toUpperCase());
    return areaResult
      || (a.area === 'GENERAL'
        ? componentResult || rank(GENERAL_SIDES, a.side) - rank(GENERAL_SIDES, b.side)
        : componentResult || rank(SIDE_ORDER, a.side) - rank(SIDE_ORDER, b.side) || compareUnit(a.unit, b.unit))
      || rank(serviceOrder, a.service) - rank(serviceOrder, b.service)
      || left.index - right.index;
  });
  for (const { section, index } of ordered) {
    const component = section.component.trim();
    if (!component) continue;
    const qualifier = [section.side, section.unit == null ? '' : String(section.unit)].filter(Boolean).join(' ');
    const key = `${section.service}\u0000${component}\u0000${qualifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ service: section.service, component, qualifier, index });
  }
  return entries;
}

function generatedScope(sections: ReportSection[]): Pick<CoverInfo, 'scopeTitle' | 'scopeDescription'> {
  const entries = scopeEntries(sections);
  const groups: Array<{ service: ServiceKind; components: string[] }> = [];
  const groupMap = new Map<ServiceKind, { service: ServiceKind; components: string[] }>();
  for (const entry of entries) {
    let group = groupMap.get(entry.service);
    if (!group) {
      group = { service: entry.service, components: [] };
      groupMap.set(entry.service, group);
      groups.push(group);
    }
    if (!group.components.includes(entry.component)) group.components.push(entry.component);
  }
  const scopeTitle = groups.map((group) => `${SERVICE_REPORT_LABELS[group.service]} of ${group.components.join(' & ')}`).join('; ');
  const scopeDescription = groups.map((group) => {
    const details = entries.filter((entry) => entry.service === group.service && group.components.includes(entry.component));
    const componentDetails = details.map((entry) => entry.qualifier ? `${entry.component} (${entry.qualifier})` : entry.component);
    return `${SERVICE_REPORT_LABELS[group.service]}: ${[...new Set(componentDetails)].join(' & ')}`;
  }).join('\n');
  return { scopeTitle, scopeDescription };
}

export function syncGeneratedCoverScope(cover: CoverInfo, sections: ReportSection[], force = false): CoverInfo {
  if (cover.scopeMode === 'MANUAL' && !force) return cover;
  return { ...cover, ...generatedScope(sections), scopeMode: 'AUTO' };
}
