import type { ReportSection, ServiceKind } from '../domain/types';
import type { ReportInfo } from './reportInfo';
import { SERVICE_REPORT_LABELS } from './reportInfo';

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
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
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
    operationDate: formatCoverDate(info.operation.start || info.operation.eta),
    location: info.operation.location,
  };
}

function scopeEntries(sections: ReportSection[]): Array<{ service: ServiceKind; component: string; qualifier: string }> {
  const seen = new Set<string>();
  const entries: Array<{ service: ServiceKind; component: string; qualifier: string }> = [];
  for (const section of sections) {
    const component = section.component.trim();
    if (!component) continue;
    const qualifier = [section.side, section.unit == null ? '' : String(section.unit)].filter(Boolean).join(' ');
    const key = `${section.service}\u0000${component}\u0000${qualifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ service: section.service, component, qualifier });
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
