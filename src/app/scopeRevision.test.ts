import { expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import { initialReportState, reportReducer } from './reportState';
import { reconcileScope, scopeTargetsFromSections } from './scopeRevision';
import { conditionGroupKey } from './conditionDefaults';
const sections=createNicheSections({component:'Sea Chest',type:'QUANTITY',quantity:2,service:'CLEANING'});
it('preserves retained conditions and unassigns removed photos without losing captions',()=>{
  const state=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
  state.sections[0].conditions.BEFORE!.fouling.coverage=20;
  state.photos=[{id:'p',sectionId:sections[1].id,phase:'BEFORE',file:new File(['x'],'x.jpg'),order:3,reportUse:true,relativePath:'2/3/x.jpg',captionText:'keep'}];
  const next=reconcileScope(state,[sections[0]]);
  expect(next.sections[0].conditions.BEFORE?.fouling.coverage).toBe(20);
  expect(next.photos[0]).toMatchObject({sectionId:null,phase:null,captionText:'keep',order:3});
  expect(next.photos[0].file).toBe(state.photos[0].file);
});
it('does not carry condition values across a change in work type',()=>{
  const state=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
  state.sections[0].conditions.AFTER!.fouling.coverage=40;
  const removal=createNicheSections({component:'Sea Chest',type:'QUANTITY',quantity:2,service:'REMOVAL'});
  expect(reconcileScope(state,removal).sections[0].conditions.AFTER?.fouling.coverage).toBe(0);
});
it('retains only pending drafts for groups and phases that remain in the scope',()=>{
 const state=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
 const key=`${conditionGroupKey(sections[0])}:BEFORE`;
 state.groupDrafts={[key]:sections[0].conditions.BEFORE!,removed:sections[0].conditions.BEFORE!};
 expect(Object.keys(reconcileScope(state,[sections[0]]).groupDrafts??{})).toEqual([key]);
 expect(reconcileScope(state,[]).groupDrafts).toEqual({});
});
it('preserves original photos through scope reset and rebuild',()=>{
 let state=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
 const file=new File(['original'],'photo.jpg');
 state.photos=[{id:'p',file,sectionId:sections[0].id,phase:'BEFORE',order:0,reportUse:true,relativePath:'2/3/photo.jpg',captionText:'keep'}];
 state=reportReducer(state,{type:'REVISE_SCOPE',sections:[]});
 state=reportReducer(state,{type:'REVISE_SCOPE',sections});
 expect(state.photos[0]).toMatchObject({file,sectionId:null,phase:null,captionText:'keep'});
});
it('rebuilds the applied scope selector targets independently of an edited draft',()=>{
 const targets=scopeTargetsFromSections(sections);
 expect(targets.generalTargets).toHaveLength(15);
 expect(targets.nicheItems).toHaveLength(1);
 expect(targets.nicheItems[0]).toMatchObject({component:'SEA CHEST',quantity:2,type:'QUANTITY'});
 expect(targets.nicheItems[0].targets.map(item=>item.services)).toEqual([['CLEANING'],['CLEANING']]);
});
it('invalidates a confirmed condition after an edit',()=>{
  let state=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
  state=reportReducer(state,{type:'CONFIRM_CONDITION',sectionId:sections[0].id,phase:'AFTER'});
  expect(state.conditionReviews?.[sections[0].id]?.AFTER).toBe(true);
  state=reportReducer(state,{type:'UPDATE_CONDITION',sectionId:sections[0].id,phase:'AFTER',patch:{fouling:{coverage:5}}});
  expect(state.conditionReviews?.[sections[0].id]?.AFTER).toBe(false);
});
it('appends a multi-selection in chosen order and ignores duplicate IDs',()=>{
  const state=reportReducer(initialReportState,{type:'SET_SCOPE',sections});
  state.photos=['one','two','three'].map((id,order)=>({id,sectionId:null,phase:null,file:new File(['x'],`${id}.jpg`),order,relativePath:id,captionText:'',reportUse:true}));
  const next=reportReducer(state,{type:'ASSIGN_PHOTOS',photoIds:['three','one','three'],sectionId:sections[0].id,phase:'BEFORE'});
  expect(next.photos.filter((photo)=>photo.sectionId).sort((a,b)=>a.order-b.order).map((photo)=>photo.id)).toEqual(['three','one']);
});
