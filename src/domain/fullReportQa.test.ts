import {it,expect} from 'vitest';
import {checkReport} from './qa';
import {emptyReportInfo} from '../app/reportInfo';
import {createNicheTargets,createReportSections} from './structure';
it('separates unreviewed defaults and reversed times from optional warnings',()=>{
 const info=emptyReportInfo();info.operation.start='2026-09-02T18:00';info.operation.end='2026-09-01T18:00';
 const sections=createReportSections(createNicheTargets({component:'Sea Chest',type:'SINGLE',quantity:1,service:'CLEANING'}));
 const issues=checkReport(sections,[],undefined,info,{});
 expect(issues.some((issue)=>issue.kind==='UNREVIEWED_CONDITION'&&issue.severity==='ERROR')).toBe(true);
 expect(issues.some((issue)=>issue.kind==='INVALID_TIME'&&issue.severity==='ERROR')).toBe(true);
 expect(issues.some((issue)=>issue.kind==='READINESS_PHOTOS'&&issue.severity==='WARNING')).toBe(true);
});
it('does not report intentionally excluded photos as unassigned work',()=>{
 const photo={id:'excluded',sectionId:null,phase:null,file:new File(['x'],'x.jpg'),reportUse:false,order:0,relativePath:'x.jpg',captionText:''};
 expect(checkReport([],[photo]).some(issue=>issue.kind==='UNMATCHED')).toBe(false);
 expect(checkReport([],[photo]).find(issue=>issue.kind==='EXCLUDED_PHOTOS')?.severity).toBe('WARNING');
});
