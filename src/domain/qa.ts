import type { PhotoData, QaIssue, ReportSection } from './types';
import { linkedCoverValues, type CoverInfo, type LinkedCoverValues } from '../app/coverInfo';
import type { ReportInfo } from '../app/reportInfo';

const activeCount = (photos: PhotoData[], sectionId: string, phase: string) =>
  photos.filter(
    (photo) => photo.reportUse && photo.sectionId === sectionId && photo.phase === phase,
  ).length;

const isImbalanced = (before: number, after: number) => {
  const high = Math.max(before, after);
  const low = Math.min(before, after);
  return high - low >= 3 && (low === 0 || high >= low * 2);
};

export function checkReport(sections: ReportSection[], photos: PhotoData[], coverInfo?: CoverInfo, reportInfo?: ReportInfo): QaIssue[] {
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

  const unmatched = photos.filter((photo) => !photo.sectionId || !photo.phase).length;
  if (unmatched > 0) {
    issues.push({
      id: 'unmatched',
      kind: 'UNMATCHED',
      message: `미배정 사진 ${unmatched}장을 배정하세요.`,
      sectionId: null,
    });
  }
  return issues;
}
