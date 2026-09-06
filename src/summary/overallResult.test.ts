import { it, expect } from 'vitest';
import { buildOverallResult } from './overallResult';
import { createReportSections, createNicheTargets } from '../domain/structure';
it('excludes unreviewed defaults and preserves manual wording with stale indication', () => {
  const sections=createReportSections(createNicheTargets({component:'Rope Guard',type:'SINGLE',quantity:1,service:'REMOVAL'}));
  const unreviewed=buildOverallResult(sections,{});
  expect(unreviewed.narrative).toContain('No confirmed');
  expect(unreviewed.narrative).not.toContain('no damage');
  const reviewed=Object.fromEntries(sections.map((section)=>[section.id,{AFTER:true}]));
  const result=buildOverallResult(sections,reviewed);
  expect(result.headline).toContain('Removal');
  expect(result.narrative).toContain('Rating 0');
  const manual=buildOverallResult(sections,reviewed,{headline:'CUSTOM',narrative:'Evidence only.',sourceFingerprint:unreviewed.sourceFingerprint});
  expect(manual.headline).toBe('CUSTOM');expect(manual.stale).toBe(true);
});
