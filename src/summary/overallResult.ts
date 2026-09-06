import type { ReportSection } from '../domain/types';
import type { ReportState } from '../app/reportState';
import { SERVICE_REPORT_LABELS, type OverallResultOverride } from '../app/reportInfo';
import { buildSummaryModel } from './summaryModel';
export function buildOverallResult(sections:ReportSection[],reviews?:ReportState['conditionReviews'],override?:OverallResultOverride) {
  const confirmed=sections.filter((section)=>reviews === undefined || reviews[section.id]?.[section.phases.includes('AFTER')?'AFTER':section.phases[0]]);
  const model=buildSummaryModel(confirmed);
  const services=[...new Set(sections.map((section)=>SERVICE_REPORT_LABELS[section.service]))].join(' / ');
  const sourceFingerprint=JSON.stringify(sections.map((section)=>[section.id,section.conditions,reviews?.[section.id]??null]));
  const headline=confirmed.length?`${services} — ${model.headline}`:`${services || 'Service'} — Final Condition Awaiting Confirmation`;
  const narrative=confirmed.length
    ? `Report scope: ${services}. ${model.narrative}${confirmed.length<sections.length?' Some final conditions are not yet confirmed.':''}`
    : 'No confirmed final condition is available. Review the detail conditions before issuing this report.';
  return {headline:override?.headline??headline,narrative:override?.narrative??narrative,sourceFingerprint,stale:!!override&&override.sourceFingerprint!==sourceFingerprint};
}
