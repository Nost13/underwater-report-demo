import { expect, it } from 'vitest';
import { emptyReportInfo } from '../app/reportInfo';
import { createCoverInfo } from '../app/coverInfo';
import { initialReportState } from '../app/reportState';
import { createGeneralTargets } from '../domain/structure';
import { parseReportSnapshot, type ReportSnapshot } from './reportSnapshot';
import { createNicheSections } from '../domain/structure';
import { reportReducer } from '../app/reportState';

const fixture = (): ReportSnapshot => ({ kind:'uws-job',version:1,stage:0,imo:'',vessel:null,vesselSchedule:null,reportInfo:emptyReportInfo(),coverEdits:createCoverInfo(),activeService:'CLEANING',generalScope:{targets:createGeneralTargets(),undo:null},nicheDraft:{component:'Sea Chest',type:'SIDE_QUANTITY',quantity:2},includeFinBlade:false,nicheItems:[],scopeMeta:null,vesselDiagram:null,report:initialReportState,photoImportComplete:false,activePhotoPhase:'BEFORE' });
it('round trips matrix values and individual protection in the normal job snapshot',()=>{
 const sections=createNicheSections({component:'Sea Chest',type:'SIDE',quantity:1,service:'REMOVAL'});
 let report=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
 report=reportReducer(report,{type:'APPLY_MATRIX_CONDITION',anchorId:sections[0].id,sectionIds:sections.map(s=>s.id),phase:'BEFORE',condition:{fouling:{coverage:10,slimeOnly:false,type:'Light Macro fouling'},observed:{level:'Minor Observation',type:'Coating'}}});
 report=reportReducer(report,{type:'UPDATE_CONDITION',sectionId:sections[0].id,phase:'BEFORE',patch:{fouling:{coverage:30,type:'Heavy Macro fouling'}}});
 const restored=parseReportSnapshot(JSON.parse(JSON.stringify({...fixture(),report}))).report;
 expect(restored.sections[0].conditions.BEFORE?.fouling.coverage).toBe(30);
 expect(restored.sections[1].conditions.BEFORE?.fouling.coverage).toBe(10);
 expect(restored.conditionSources[sections[0].id].BEFORE).toBe('OVERRIDE');
 expect(restored.conditionSources[sections[1].id].BEFORE).toBe('MATRIX');
});
it('preserves performer choices and rejects invalid saved performers',()=>{
 const job=fixture();job.coverEdits.scopePerformers={'CLEANING|GENERAL':'BOTH'};
 expect(parseReportSnapshot(JSON.parse(JSON.stringify(job))).coverEdits.scopePerformers).toEqual({'CLEANING|GENERAL':'BOTH'});
 job.coverEdits.scopePerformers={'CLEANING|GENERAL':'invented'};
 expect(()=>parseReportSnapshot(job)).toThrow();
});
it('rejects broken undo, crop, booleans and nested labels before hydration',()=>{
 const base=fixture();
 for(const value of [
  {...base,generalScope:{...base.generalScope,undo:{}}},
  {...base,coverEdits:{...base.coverEdits,crop:{focusX:.5,focusY:.5,zoom:0}}},
  {...base,includeFinBlade:'yes'},
  {...base,report:{...base.report,reportLabels:{bad:{detailTitle:0}}}},
 ]) expect(()=>parseReportSnapshot(value)).toThrow();
});
it('rejects a partially forged report rather than accepting an empty operation object', () => {
  const value = fixture();
  expect(() => parseReportSnapshot({ ...value, reportInfo:{ ...value.reportInfo,operation:{} } })).toThrow(/구조/);
});
it('rejects malformed personnel rows before they can reach Word', () => {
  const value = fixture();
  expect(() => parseReportSnapshot({ ...value, reportInfo:{ ...value.reportInfo, personnelQualifications:[null] } })).toThrow(/구조/);
});
it('accepts a complete empty job but rejects an invalid niche quantity', () => {
  const value = fixture();
  expect(parseReportSnapshot(value).kind).toBe('uws-job');
  expect(() => parseReportSnapshot({...value,nicheDraft:{...value.nicheDraft,quantity:-1}})).toThrow(/구조/);
});
it('rejects malformed section, photo identity, focus and vessel fields',()=>{
 const base=fixture();const sections=createNicheSections({component:'Rope Guard',type:'SINGLE',quantity:1,service:'REMOVAL'});
 const report=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
 const photo={id:'p',file:new File(['x'],'x.jpg'),sectionId:sections[0].id,phase:'BEFORE',relativePath:'2/3/x.jpg',captionText:'',order:0,reportUse:true};
 for(const value of [
  {...base,report:{...report,sections:[{...sections[0],side:{}}]}},
  {...base,report:{...report,photos:[photo,photo]}},
  {...base,report:{...report,photos:[{...photo,phase:'CURRENT'}]}},
  {...base,report:{...report,focusedSectionId:'missing'}},
  {...base,vessel:{name:'TEST',imo:'1234567',type:{},classSociety:'',flag:''}},
 ])expect(()=>parseReportSnapshot(value)).toThrow();
});
