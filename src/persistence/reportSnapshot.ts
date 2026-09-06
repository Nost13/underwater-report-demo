import type { Vessel } from '../app/demoData';
import type { CoverInfo } from '../app/coverInfo';
import type { ReportInfo } from '../app/reportInfo';
import { emptyReportInfo } from '../app/reportInfo';
import type { ReportState } from '../app/reportState';
import type { VesselSchedule } from '../app/scheduleLookup';
import type { ScopeTarget, NicheType, ServiceKind, Phase } from '../domain/types';
import type { VesselDiagramConfig } from '../vesselDiagram/types';
import {validDiagram} from './validateDiagram';
import {createGeneralTargets} from '../domain/structure';

export interface ReportSnapshot {
  kind: 'uws-job'; version: 1; stage: number; imo: string; vessel: Vessel | null;
  vesselSchedule: VesselSchedule | null; reportInfo: ReportInfo; coverEdits: CoverInfo;
  activeService: ServiceKind; generalScope: { targets: ScopeTarget[]; undo: ScopeTarget[] | null };
  nicheDraft: { component: string; type: NicheType; quantity: number }; includeFinBlade: boolean;
  nicheItems: Array<{ id: string; component: string; type: NicheType; quantity: number; targets: ScopeTarget[] }>;
  scopeMeta: { vesselName: string } | null; vesselDiagram: VesselDiagramConfig | null;
  report: ReportState; photoImportComplete: boolean; activePhotoPhase: Phase;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const services = ['INSPECTION', 'CLEANING', 'POLISHING', 'REPAIR', 'REMOVAL'];
const phases = ['CURRENT', 'BEFORE', 'AFTER'];
const textRecord = (value: unknown) => object(value) && Object.values(value).every((item) => typeof item === 'string');
const file = (value: unknown) => value === null || value instanceof File;
const conditionValid=(value:unknown)=>{
 if(!object(value)||!object(value.fouling)||!object(value.observed))return false;
 const f=value.fouling,o=value.observed;
 return typeof f.slimeOnly==='boolean'&&(f.coverage===null||(typeof f.coverage==='number'&&Number.isFinite(f.coverage)&&f.coverage>=0&&f.coverage<=100))
  &&['','Clean / No Fouling','Micro fouling','Light Macro fouling','Medium Macro Fouling','Heavy Macro fouling','Severe Macro Fouling'].includes(f.type as string)
  &&['','Normal / Trace','Minor Observation','Notable Observation','Significant Observation','Critical Observation'].includes(o.level as string)
  &&['','Coating','Damage','Scratch','Corrosion','Other'].includes(o.type as string);
};
const phaseMap=(value:unknown,check:(value:unknown)=>boolean)=>object(value)&&Object.entries(value).every(([key,item])=>phases.includes(key)&&check(item));
const optionalMap=(value:unknown,check:(value:unknown)=>boolean)=>value===undefined||(object(value)&&Object.values(value).every(check));

export function parseReportSnapshot(value: unknown): ReportSnapshot {
  const fail = () => { throw new Error('보고서 작업 파일의 구조가 올바르지 않습니다. 현재 작업은 유지됩니다.'); };
  if (!object(value) || value.kind !== 'uws-job' || value.version !== 1) return fail();
  const input = value as unknown as ReportSnapshot;
  if (!Number.isInteger(input.stage) || input.stage < 0 || input.stage > 8 || typeof input.imo !== 'string'
    || !services.includes(input.activeService) || !phases.includes(input.activePhotoPhase)) return fail();
  if(typeof input.includeFinBlade!=='boolean'||typeof input.photoImportComplete!=='boolean'||(input.scopeMeta!==null&&(!object(input.scopeMeta)||typeof input.scopeMeta.vesselName!=='string')))return fail();
  if(input.vesselSchedule!==null&&(!object(input.vesselSchedule)||!['vessel','terminal','berth','carrier','direction','port','eta','etd'].every((key)=>typeof (input.vesselSchedule as unknown as Record<string,unknown>)[key]==='string')))return fail();
  const info = input.reportInfo;
  if (!object(info) || !textRecord(info.vessel) || !textRecord(info.operation) || !textRecord(info.personnelCounts)
    || !Array.isArray(info.personnelQualifications) || !Array.isArray(info.serviceItems) || !info.serviceItems.every((item) => typeof item === 'string')
    || !object(info.readiness)) return fail();
  const defaults = emptyReportInfo();
  if(!optionalMap(info.operationModes,(mode)=>mode==='AUTO'||mode==='MANUAL')||!optionalMap(info.personnelCountModes,(mode)=>mode==='AUTO'||mode==='MANUAL'))return fail();
  if(info.overallResult!==undefined&&(!object(info.overallResult)||!['headline','narrative','sourceFingerprint'].every((key)=>typeof (info.overallResult as unknown as Record<string,unknown>)[key]==='string')))return fail();
  for (const group of ['vessel', 'operation', 'personnelCounts'] as const) {
    if (!Object.keys(defaults[group]).every((key) => typeof (info[group] as unknown as Record<string, unknown>)[key] === 'string')) return fail();
  }
  if (info.personnelQualifications.some((person) => !object(person) || !['koreanName', 'englishName', 'birth', 'role', 'qualification', 'certificateNo', 'issuingBody'].every((key) => typeof (person as unknown as Record<string, unknown>)[key] === 'string'))) return fail();
  if (!['toolboxTime', 'toolboxNote', 'preparationTime', 'preparationNote'].every((key) => typeof (info.readiness as unknown as Record<string, unknown>)[key] === 'string')) return fail();
  for (const key of ['toolboxPhotos', 'preparationPhotos'] as const) {
    if (!Array.isArray(info.readiness[key]) || info.readiness[key].length !== 2 || !info.readiness[key].every(file)) return fail();
  }
  if (!object(input.coverEdits) || !file(input.coverEdits.photoFile) || !object(input.coverEdits.crop)
    || !Object.values(input.coverEdits.crop).every(Number.isFinite)) return fail();
  const crop=input.coverEdits.crop;
  if(![crop.focusX,crop.focusY,crop.zoom].every(Number.isFinite)||crop.focusX<0||crop.focusX>1||crop.focusY<0||crop.focusY>1||crop.zoom<1||crop.zoom>3||!['AUTO','MANUAL'].includes(input.coverEdits.scopeMode)||!['issueDate','scopeTitle','scopeDescription'].every((key)=>typeof (input.coverEdits as unknown as Record<string,unknown>)[key]==='string'))return fail();
  const report = input.report;
  if (!object(report) || !Array.isArray(report.sections) || !Array.isArray(report.photos)
    || !object(report.conditionDefaults) || !object(report.conditionSources) || !object(report.reportLabels) || !object(report.workPerformLabels)) return fail();
  if(!Object.values(report.conditionDefaults).every((value)=>phaseMap(value,conditionValid))||!Object.values(report.conditionSources).every((value)=>phaseMap(value,(source)=>source==='GROUP'||source==='OVERRIDE'))
    ||!optionalMap(report.conditionReviews,(value)=>phaseMap(value,(review)=>typeof review==='boolean'))||!optionalMap(report.groupDrafts,conditionValid)
    ||!Object.values(report.reportLabels).every((label)=>object(label)&&['upperAreaLabel','detailTitle','photoCaption'].every((key)=>typeof label[key]==='string'))
    ||!Object.values(report.workPerformLabels).every((label)=>object(label)&&typeof label.main==='string'&&typeof label.phase==='string'))return fail();
  const ids = new Set<string>();
  for (const section of report.sections) {
    if (!object(section) || typeof section.id !== 'string' || ids.has(section.id) || typeof section.component !== 'string' || typeof section.targetId !== 'string'
      || !['GENERAL', 'NICHE'].includes(section.area) || !services.includes(section.service) || !Array.isArray(section.phases)
      || (section.side!==undefined&&!['PORT','STBD','BOTTOM'].includes(section.side)) || (section.unit!==undefined&&(!Number.isSafeInteger(section.unit)||section.unit<1))
      || !section.phases.length || !section.phases.every((phase) => phases.includes(phase)) || !object(section.conditions)) return fail();
    ids.add(section.id);
    for (const phase of section.phases) {
      const condition = section.conditions[phase];
      if(!conditionValid(condition))return fail();
      if (!condition || !object(condition.fouling) || !object(condition.observed)
        || !(condition.fouling.coverage === null || (Number.isFinite(condition.fouling.coverage) && condition.fouling.coverage >= 0 && condition.fouling.coverage <= 100))
        || typeof condition.fouling.slimeOnly !== 'boolean' || typeof condition.fouling.type !== 'string'
        || typeof condition.observed.type !== 'string' || typeof condition.observed.level !== 'string') return fail();
    }
  }
  if(report.focusedSectionId!==null&&!ids.has(report.focusedSectionId))return fail();
  const photoIds=new Set<string>();
  for (const photo of report.photos) {
    if (!object(photo) || !(photo.file instanceof File) || typeof photo.id !== 'string' || typeof photo.relativePath !== 'string' || typeof photo.captionText !== 'string'
      || photoIds.has(photo.id) || typeof photo.reportUse !== 'boolean' || !Number.isFinite(photo.order)
      || (photo.sectionId !== null && !ids.has(photo.sectionId)) || (photo.phase !== null && !phases.includes(photo.phase))) return fail();
    if((photo.sectionId===null)!==(photo.phase===null)|| (photo.sectionId!==null&&!report.sections.find((section)=>section.id===photo.sectionId)?.phases.includes(photo.phase!)))return fail();
    photoIds.add(photo.id);
  }
  if (!object(input.generalScope) || !Array.isArray(input.generalScope.targets) || !Array.isArray(input.nicheItems) || !object(input.nicheDraft)) return fail();
  const nicheValid = (item: ReportSnapshot['nicheDraft']) => typeof item.component === 'string' && ['SINGLE', 'SIDE', 'QUANTITY', 'SIDE_QUANTITY'].includes(item.type) && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 1000;
  if (!nicheValid(input.nicheDraft) || input.nicheItems.some((item) => !object(item) || typeof item.id!=='string' || !nicheValid(item))) return fail();
  const targets = [...input.generalScope.targets];
  if(input.generalScope.undo!==null){if(!Array.isArray(input.generalScope.undo))return fail();targets.push(...input.generalScope.undo);}
  const completeGeneral=(items:typeof targets)=>items.length===15&&createGeneralTargets().every((expected)=>items.some((item)=>item?.area==='GENERAL'&&item.component===expected.component&&item.side===expected.side));
  if(!completeGeneral(input.generalScope.targets)||(input.generalScope.undo!==null&&!completeGeneral(input.generalScope.undo)))return fail();
  for (const group of input.nicheItems) { if (!Array.isArray(group.targets)) return fail(); targets.push(...group.targets); }
  if (targets.some((target) => !object(target) || typeof target.id !== 'string' || typeof target.component !== 'string'
    || !['GENERAL','NICHE'].includes(target.area) || (target.side!==undefined&&!['PORT','STBD','BOTTOM'].includes(target.side)) || (target.unit!==undefined&&(!Number.isInteger(target.unit)||target.unit<1))
    || !Array.isArray(target.services) || !target.services.every((service) => services.includes(service)))) return fail();
  if (input.vessel !== null && (!object(input.vessel) || !textRecord(input.vessel) || !['name','imo','type','classSociety','flag'].every((key)=>typeof (input.vessel as unknown as Record<string,unknown>)[key]==='string'))) return fail();
  const diagram = input.vesselDiagram;
  if(diagram!==null&&!validDiagram(diagram))return fail();
  if (diagram !== null) {
    if (!object(diagram) || !(diagram.imageFile instanceof File) || !object(diagram.calibration) || !Object.values(diagram.calibration).every(Number.isFinite)
      || !Array.isArray(diagram.hullMarkers) || !Array.isArray(diagram.nicheMarkers) || typeof diagram.confirmed !== 'boolean') return fail();
    for (const marker of [...diagram.hullMarkers, ...diagram.nicheMarkers]) {
      if (!object(marker) || !object(marker.rect) || !Object.values(marker.rect).every(Number.isFinite)
        || marker.rect.width <= 0 || marker.rect.height <= 0 || !['CIRCLE', 'ELLIPSE', 'RECTANGLE'].includes(marker.shape)) return fail();
    }
  }
  return input;
}
