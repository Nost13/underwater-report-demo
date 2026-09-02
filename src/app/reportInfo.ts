import type { ServiceKind } from '../domain/types';
import type { Vessel } from './demoData';
import type { DiverQualification } from './diverQualifications';

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
  readiness: {
    toolboxTime: string;
    toolboxNote: string;
    preparationTime: string;
    preparationNote: string;
  };
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
    readiness: { toolboxTime: '', toolboxNote: '', preparationTime: '', preparationNote: '' },
  };
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
