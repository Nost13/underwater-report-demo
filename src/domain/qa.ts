import type { PhotoData, QaIssue, ReportSection } from './types';
import { linkedCoverValues, type CoverInfo, type LinkedCoverValues } from '../app/coverInfo';
import type { ReportInfo } from '../app/reportInfo';
import { countPersonnel, formatWorkingTime } from '../app/reportInfo';
import type { ReportState } from '../app/reportState';

const activeCount = (photos: PhotoData[], sectionId: string, phase: string) =>
  photos.filter(
    (photo) => photo.reportUse && photo.sectionId === sectionId && photo.phase === phase,
  ).length;

const isImbalanced = (before: number, after: number) => {
  const high = Math.max(before, after);
  const low = Math.min(before, after);
  return high - low >= 3 && (low === 0 || high >= low * 2);
};

export function checkReport(sections: ReportSection[], photos: PhotoData[], coverInfo?: CoverInfo, reportInfo?: ReportInfo, reviews?:ReportState['conditionReviews'], groupDrafts?:ReportState['groupDrafts']): QaIssue[] {
  const issues: QaIssue[] = [];
  if (coverInfo) {
    if (!coverInfo.photoFile) issues.push({ id: 'cover:photo', kind: 'MISSING_COVER_PHOTO', sectionId: null, message: '커버 사진이 없습니다. 사진 영역은 빈 상태로 내보냅니다.' });
    const labels: Record<keyof LinkedCoverValues, string> = {
      reportNo: 'Job No', vesselName: '선박명', imoNumber: 'IMO 번호', callSign: '호출 부호',
      ownerClient: '선주 / 고객', operationDate: '작업일 (Start 또는 ETA)', location: '작업 장소',
    };
    const values = reportInfo ? linkedCoverValues(reportInfo) : null;
    for (const key of Object.keys(labels) as Array<keyof LinkedCoverValues>) {
      if (!values?.[key].trim()) issues.push({ id: `cover:${key}`, kind: 'MISSING_COVER_METADATA', sectionId: null, message: `커버에 연결된 ${labels[key]} 정보가 없습니다. Report Information에서 확인하세요.` });
    }
  }

  for (const section of sections) {
    for (const phase of section.phases) {
      if(reviews && !reviews[section.id]?.[phase]) issues.push({id:`review:${section.id}:${phase}`,kind:'UNREVIEWED_CONDITION',sectionId:section.id,phase,message:`${section.id} · ${phase} 컨디션 확인이 필요합니다.`,severity:'ERROR',stage:5});
      if (activeCount(photos, section.id, phase) === 0) {
        issues.push({
          id: `photo:${section.id}:${phase}`,
          kind: 'MISSING_PHASE_PHOTO',
          message: `${section.id} · ${phase} 사진이 없습니다.`,
          sectionId: section.id,
          phase,
        });
      }
      const condition = section.conditions[phase];
      const coverage = condition?.fouling.coverage;
      const hasValidCoverage = Number.isInteger(coverage) && (coverage ?? -1) >= 0 && (coverage ?? 101) <= 100;
      if (!condition?.fouling.type || !hasValidCoverage) {
        issues.push({
          id: `condition:${section.id}:${phase}`,
          kind: 'MISSING_CONDITION',
          message: `${section.id} · ${phase} Condition을 확인하세요.`,
          sectionId: section.id,
          phase,
        });
      }
    }
    if (section.phases.includes('BEFORE') && section.phases.includes('AFTER')) {
      const before = activeCount(photos, section.id, 'BEFORE');
      const after = activeCount(photos, section.id, 'AFTER');
      if (isImbalanced(before, after)) {
        issues.push({
          id: `imbalance:${section.id}`,
          kind: 'PHASE_IMBALANCE',
          message: `${section.id} · BEFORE ${before} / AFTER ${after} 수량 차이가 큽니다.`,
          sectionId: section.id,
          phase: before < after ? 'BEFORE' : 'AFTER',
        });
      }
    }
  }

  const unmatched = photos.filter((photo) => photo.reportUse && (!photo.sectionId || !photo.phase)).length;
  const excluded=photos.filter(photo=>!photo.reportUse).length;
  if(excluded)issues.push({id:'excluded',kind:'EXCLUDED_PHOTOS',sectionId:null,stage:5,severity:'WARNING',message:`보고서에서 제외한 사진 ${excluded}장입니다. 의도한 제외인지 확인하세요.`});
  if (unmatched > 0) {
    issues.push({
      id: 'unmatched',
      kind: 'UNMATCHED',
      message: `미배정 사진 ${unmatched}장을 배정하세요.`,
      sectionId: null,
    });
  }
  if(reportInfo) {
    for(const [start,end,label] of [[reportInfo.operation.eta,reportInfo.operation.etd,'ETA / ETD'],[reportInfo.operation.start,reportInfo.operation.end,'START / END']]) {
      if(start&&end&&!formatWorkingTime(start,end))issues.push({id:`time:${label}`,kind:'INVALID_TIME',sectionId:null,stage:1,severity:'ERROR',message:`${label}: 날짜·시간 형식과 종료 순서를 확인하세요.`});
    }
    for(const [key,label] of [['toolboxPhotos','Toolbox'],['preparationPhotos','현장 준비']] as const) {
      const count=reportInfo.readiness[key].filter(Boolean).length;
      if(count<2)issues.push({id:key,kind:'READINESS_PHOTOS',sectionId:null,stage:1,severity:'WARNING',message:`${label} 사진 ${count}/2장입니다. 누락 사유를 확인하세요.`});
    }
    const actual=countPersonnel(reportInfo.personnelQualifications);
    if(Object.keys(actual).some((key)=>reportInfo.personnelCounts[key as keyof typeof actual].trim()!==actual[key as keyof typeof actual]))issues.push({id:'personnel',kind:'PERSONNEL_MISMATCH',sectionId:null,stage:1,severity:'WARNING',message:'역할별 투입 인원과 선택한 자격자료 인원이 다릅니다.'});
    if(!reportInfo.operation.weather||!reportInfo.operation.visibility)issues.push({id:'optional-operation',kind:'OPTIONAL_INFO',sectionId:null,stage:1,severity:'WARNING',message:'기상 또는 시정 등 선택 운영정보가 비어 있습니다.'});
  }
  if(groupDrafts&&Object.keys(groupDrafts).length)issues.push({id:'group-drafts',kind:'PENDING_GROUP',sectionId:null,stage:5,severity:'ERROR',message:'아직 적용하지 않은 구역 기본값이 있습니다. 해당 구역에서 적용 또는 취소하세요.'});
  return issues.map((issue)=>({...issue,severity:issue.severity??(['MISSING_PHASE_PHOTO','MISSING_CONDITION','MISSING_COVER_METADATA'].includes(issue.kind)?'ERROR':'WARNING'),stage:issue.stage??(issue.kind.startsWith('MISSING_COVER')?(issue.kind==='MISSING_COVER_PHOTO'?2:1):5)}));
}
