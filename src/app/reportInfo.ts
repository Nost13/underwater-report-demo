import type { ServiceKind } from '../domain/types';
import type { Vessel } from './demoData';
import type { DiverQualification } from './diverQualifications';

export type ReadinessPhotoSlots = [File | null, File | null];

export interface ReadinessInfo {
  toolboxTime: string;
  toolboxNote: string;
  preparationTime: string;
  preparationNote: string;
  toolboxPhotos: ReadinessPhotoSlots;
  preparationPhotos: ReadinessPhotoSlots;
}

export interface ReportInfo {
  vessel: {
    name: string;
    imo: string;
    callSign: string;
    type: string;
    loa: string;
    breadth: string;
    gt: string;
    dwt: string;
    yearBuilt: string;
    ownerClient: string;
    jobNo: string;
  };
  operation: {
    eta: string;
    etd: string;
    workWindow: string;
    location: string;
    start: string;
    end: string;
    workingTime: string;
    position: string;
    draughtFwd: string;
    draughtMid: string;
    draughtAft: string;
    berthingSide: string;
    weather: string;
    knots: string;
    current: string;
    visibility: string;
    personnel: string;
  };
  personnelQualifications: DiverQualification[];
  serviceItems: string[];
  readiness: ReadinessInfo;
}

export const SERVICE_REPORT_LABELS: Record<ServiceKind, string> = {
  INSPECTION: 'Inspection',
  CLEANING: 'Cleaning',
  POLISHING: 'Polishing',
  REPAIR: 'Repair',
  REMOVAL: 'Removal',
};

export function emptyReportInfo(): ReportInfo {
  return {
    vessel: { name: '', imo: '', callSign: '', type: '', loa: '', breadth: '', gt: '', dwt: '', yearBuilt: '', ownerClient: '', jobNo: '' },
    operation: { eta: '', etd: '', workWindow: '', location: '', start: '', end: '', workingTime: '', position: '', draughtFwd: '', draughtMid: '', draughtAft: '', berthingSide: '', weather: '', knots: '', current: '', visibility: '', personnel: '' },
    personnelQualifications: [],
    serviceItems: [],
    readiness: {
      toolboxTime: '',
      toolboxNote: 'No safety concerns noted before operation .',
      preparationTime: '',
      preparationNote: 'No abnormal conditions observed at site.',
      toolboxPhotos: [null, null],
      preparationPhotos: [null, null],
    },
  };
}

function elapsedMinutes(startValue: string, endValue: string): number | null {
  const startTime = /^(\d{1,2}):(\d{2})$/.exec(startValue.trim());
  const endTime = /^(\d{1,2}):(\d{2})$/.exec(endValue.trim());
  let elapsed: number;
  if (startTime && endTime) {
    const startMinutes = Number(startTime[1]) * 60 + Number(startTime[2]);
    const endMinutes = Number(endTime[1]) * 60 + Number(endTime[2]);
    if (Number(startTime[2]) >= 60 || Number(endTime[2]) >= 60 || startMinutes >= 24 * 60 || endMinutes >= 24 * 60) return null;
    elapsed = endMinutes - startMinutes;
    if (elapsed < 0) elapsed += 24 * 60;
  } else {
    const start = Date.parse(startValue);
    const end = Date.parse(endValue);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    elapsed = Math.round((end - start) / 60_000);
  }
  return elapsed;
}

export function formatWorkWindow(start: string, end: string): string {
  const minutes = elapsedMinutes(start, end);
  return minutes === null ? '' : `${Math.floor(minutes / 60)} Hours + 1 Hrs`;
}

export function formatWorkingTime(start: string, end: string): string {
  const minutes = elapsedMinutes(start, end);
  return minutes === null ? '' : `${Math.floor(minutes / 60)} Hrs ${minutes % 60} Min`;
}

function positionFromBerthingSide(side: string): string {
  const normalized = side.trim().toUpperCase();
  if (normalized === 'P' || normalized === 'PORT' || normalized === 'PORT SIDE') return 'PORT SIDE';
  if (normalized === 'S' || normalized === 'STBD' || normalized === 'STARBOARD' || normalized === 'STBD SIDE' || normalized === 'STARBOARD SIDE') return 'STBD SIDE';
  return side.trim();
}

export function deriveOperationValues(
  operation: ReportInfo['operation'],
  changedField?: keyof ReportInfo['operation'],
): ReportInfo['operation'] {
  const next = { ...operation };
  if (!changedField || changedField === 'eta' || changedField === 'etd') {
    const workWindow = formatWorkWindow(next.eta, next.etd);
    if (workWindow) next.workWindow = workWindow;
  }
  if (!changedField || changedField === 'start' || changedField === 'end') {
    const workingTime = formatWorkingTime(next.start, next.end);
    if (workingTime) next.workingTime = workingTime;
  }
  if (!changedField || changedField === 'location' || changedField === 'berthingSide') {
    const isAnchorage = /ANCHOR(?:AGE)?|묘박|정박지/i.test(next.location);
    const position = positionFromBerthingSide(next.berthingSide);
    if (isAnchorage && position === next.position) next.position = '';
    else if (!isAnchorage && position) next.position = position;
  }
  return next;
}

export function reportInfoFromVessel(vessel: Vessel | null): ReportInfo {
  const info = emptyReportInfo();
  if (!vessel) return info;
  return {
    ...info,
    vessel: {
      ...info.vessel,
      name: vessel.name,
      imo: vessel.imo,
      callSign: vessel.callSign ?? '',
      type: vessel.type,
      loa: vessel.loa ?? '',
      breadth: vessel.breadth ?? '',
      gt: vessel.gt ?? '',
      dwt: vessel.dwt ?? '',
      yearBuilt: vessel.yearBuilt ?? '',
      ownerClient: vessel.ownerClient ?? '',
    },
  };
}

export function reportInfoForScopes(info: ReportInfo, services: ServiceKind[]): ReportInfo {
  return { ...info, serviceItems: services.map((service) => SERVICE_REPORT_LABELS[service]) };
}
