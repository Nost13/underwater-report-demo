import { expect, it } from 'vitest';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import { emptyCondition } from '../domain/conditions';
import { buildSummaryModel } from '../summary/summaryModel';
import { buildWordPhasePages } from '../docx/reportModel';
import { initialReportState, reportReducer, type ReportAction } from './reportState';

const general = createGeneralSections('CLEANING');
const niche = createNicheSections({component:'Sea Chest',type:'SIDE',quantity:1,service:'CLEANING'});
const removal = createGeneralSections('REMOVAL');
const setup = () => reportReducer(initialReportState,{type:'SET_SCOPE',sections:[...general,...niche,...removal]});
const batch = (ids: string[], overwriteOverrides=false): ReportAction => ({
  type:'APPLY_MATRIX_CONDITION', anchorId:general[0].id, sectionIds:ids, phase:'BEFORE',
  condition:{...emptyCondition(),fouling:{coverage:10,slimeOnly:false,type:'Light Macro fouling'}}, overwriteOverrides,
} as ReportAction);

it('applies only selected same-service same-area same-phase rows and protects individual changes',()=>{
  let state=setup();
  state=reportReducer(state,{type:'UPDATE_CONDITION',sectionId:general[1].id,phase:'BEFORE',patch:{fouling:{coverage:30}}});
  state=reportReducer(state,{type:'CONFIRM_CONDITION',sectionId:general[0].id,phase:'BEFORE'});
  state=reportReducer(state,batch([general[0].id,general[1].id,general[3].id,niche[0].id,removal[0].id]));
  expect(state.sections[0].conditions.BEFORE?.fouling.coverage).toBe(10);
  expect(state.sections[1].conditions.BEFORE?.fouling.coverage).toBe(30);
  expect(state.sections[2].conditions.BEFORE?.fouling.coverage).toBeNull();
  expect(state.sections[3].conditions.BEFORE?.fouling.coverage).toBe(10);
  expect(state.sections[15].conditions.BEFORE?.fouling.coverage).toBeNull();
  expect(state.sections[17].conditions.BEFORE?.fouling.coverage).toBeNull();
  expect(state.sections[0].conditions.AFTER?.fouling.coverage).toBe(0);
  expect(state.conditionReviews?.[general[0].id]?.BEFORE).toBe(false);
  expect(state.sections[0].conditions.BEFORE).not.toBe(state.sections[3].conditions.BEFORE);
  expect(state.conditionSources[general[0].id].BEFORE).toBe('MATRIX');
});

it('supports an explicit overwrite without losing future individual-value protection',()=>{
  let state=reportReducer(setup(),{type:'UPDATE_CONDITION',sectionId:general[0].id,phase:'BEFORE',patch:{fouling:{coverage:30}}});
  state=reportReducer(state,batch([general[0].id],true));
  expect(state.sections[0].conditions.BEFORE?.fouling.coverage).toBe(10);
  expect(state.conditionSources[general[0].id].BEFORE).toBe('OVERRIDE');
});

it('does not create a missing phase or turn an empty condition into R0',()=>{
  const sections=createGeneralSections('INSPECTION');
  let state=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
  state=reportReducer(state,{...batch([sections[0].id]),anchorId:sections[0].id} as ReportAction);
  expect(state.sections[0].conditions.CURRENT?.fouling.coverage).toBeNull();
  expect(state.sections[0].conditions.BEFORE).toBeUndefined();
  state=reportReducer(state,{...batch([sections[0].id]),anchorId:sections[0].id,phase:'CURRENT',condition:emptyCondition()} as ReportAction);
  expect(state.sections[0].conditions.CURRENT?.fouling.coverage).toBeNull();
});

it('passes effective matrix values to summary and Word while leaving photos unchanged',()=>{
  let state=setup();
  const photo={id:'photo',sectionId:general[0].id,phase:'AFTER' as const,file:new File(['x'],'photo.jpg'),reportUse:true,order:0,relativePath:'photo.jpg',captionText:'kept'};
  state={...state,photos:[photo]};
  state=reportReducer(state,{...batch([general[0].id]),phase:'AFTER'} as ReportAction);
  expect(state.photos[0]).toBe(photo);
  const summary=buildSummaryModel(state.sections);
  expect(summary.mainHullRows.find(row=>row.component==='FWD'&&row.side==='PORT')?.coverage).toBe('10%');
  const page=buildWordPhasePages(state.sections,state.photos).find(page=>page.section.id===general[0].id);
  expect(page?.values.fc).toBe('10%');
});

it('retains the confirmation of a protected row and resets matrix provenance when a group default is explicitly applied',()=>{
  let state=reportReducer(setup(),{type:'UPDATE_CONDITION',sectionId:general[1].id,phase:'BEFORE',patch:{fouling:{coverage:30}}});
  state=reportReducer(state,{type:'CONFIRM_CONDITION',sectionId:general[1].id,phase:'BEFORE'});
  state=reportReducer(state,batch([general[0].id,general[1].id]));
  expect(state.conditionReviews?.[general[1].id]?.BEFORE).toBe(true);
  state=reportReducer(state,{type:'APPLY_GROUP_CONDITION',sectionId:general[0].id,phase:'BEFORE',condition:emptyCondition()});
  expect(state.conditionSources[general[0].id].BEFORE).toBe('GROUP');
  expect(state.sections[0].conditions.BEFORE?.fouling.coverage).toBeNull();
  expect(state.sections[1].conditions.BEFORE?.fouling.coverage).toBe(30);
});
