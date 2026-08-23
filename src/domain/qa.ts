import type { PhotoData, QaIssue, ReportSection } from './types';

const activeCount = (photos: PhotoData[], sectionId: string, phase: string) =>
  photos.filter(
    (photo) => photo.reportUse && photo.sectionId === sectionId && photo.phase === phase,
  ).length;

const isImbalanced = (before: number, after: number) => {
  const high = Math.max(before, after);
  const low = Math.min(before, after);
  return high - low >= 3 && (low === 0 || high >= low * 2);
};

export function checkReport(sections: ReportSection[], photos: PhotoData[]): QaIssue[] {
  const issues: QaIssue[] = [];

  for (const section of sections) {
    for (const phase of section.phases) {
      if (activeCount(photos, section.id, phase) === 0) {
        issues.push({
          id: `photo:${section.id}:${phase}`,
          kind: 'MISSING_PHASE_PHOTO',
          message: `${section.id} · ${phase} 사진이 없습니다.`,
          sectionId: section.id,
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
        });
      }
    }
  }

  const unmatched = photos.filter((photo) => !photo.sectionId || !photo.phase).length;
  if (unmatched > 0) {
    issues.push({
      id: 'unmatched',
      kind: 'UNMATCHED',
      message: `UNMATCHED 사진 ${unmatched}장을 배정하세요.`,
      sectionId: null,
    });
  }
  return issues;
}
