import type { ReportSection, ScopeTarget, NicheType } from '../domain/types';
import {createGeneralTargets} from '../domain/structure';
import type { ReportState } from './reportState';
import { conditionGroupKey, initializeConditionInheritance } from './conditionDefaults';
import { initializeReportLabels } from './reportLabels';
import { initializeWorkPerformLabels, workPerformLabelKey } from './workPerformLabels';

export const sectionIdentity = (section: ReportSection) => JSON.stringify([section.service,section.area,section.component.trim().toUpperCase(),section.side??'',section.unit??null]);
export function scopeTargetsFromSections(sections:ReportSection[]) {
  const targets=new Map<string,ScopeTarget>();
  for(const section of sections){
    const existing=targets.get(section.targetId);
    if(existing){if(!existing.services.includes(section.service))existing.services.push(section.service);}
    else targets.set(section.targetId,{id:section.targetId,area:section.area,component:section.component,side:section.side,unit:section.unit,services:[section.service]});
  }
  const generalTargets=createGeneralTargets().map(target=>targets.get(target.id)??target);
  const components=[...new Set(sections.filter(section=>section.area==='NICHE').map(section=>section.component))];
  const nicheItems=components.map(component=>{
    const items=[...targets.values()].filter(target=>target.area==='NICHE'&&target.component===component);
    const side=items.some(target=>target.side),unit=items.some(target=>target.unit);
    const type:NicheType=side?(unit?'SIDE_QUANTITY':'SIDE'):(unit?'QUANTITY':'SINGLE');
    return {id:`restored:${component}`,component,type,quantity:Math.max(1,...items.map(target=>target.unit??1)),targets:items};
  });
  return {generalTargets,nicheItems};
}
export function scopeChanges(previous: ReportSection[],next:ReportSection[]) {
  const before=new Set(previous.map(sectionIdentity));const after=new Set(next.map(sectionIdentity));
  return {added:next.filter((section)=>!before.has(sectionIdentity(section))),removed:previous.filter((section)=>!after.has(sectionIdentity(section))),retained:next.filter((section)=>before.has(sectionIdentity(section)))};
}
export function reconcileScope(state:ReportState,next:ReportSection[]):ReportState {
  const old=new Map(state.sections.map((section)=>[sectionIdentity(section),section]));
  const remap=new Map<string,string>();
  const sections=next.map((section)=>{const previous=old.get(sectionIdentity(section));if(!previous)return section;remap.set(previous.id,section.id);return {...section,conditions:previous.conditions};});
  const inheritance=initializeConditionInheritance(sections);
  const reviews:NonNullable<ReportState['conditionReviews']>={};
  const workPerformLabels=initializeWorkPerformLabels(sections);
  for(const section of sections) {
    const previous=old.get(sectionIdentity(section));
    if(previous) {
      inheritance.conditionSources[section.id]=state.conditionSources[previous.id]??inheritance.conditionSources[section.id];
      reviews[section.id]=state.conditionReviews?.[previous.id]??{};
      for(const phase of section.phases) {const label=state.workPerformLabels[workPerformLabelKey(previous.id,phase)];if(label)workPerformLabels[workPerformLabelKey(section.id,phase)]=label;}
    }
    const group=conditionGroupKey(section);
    if(state.conditionDefaults[group])inheritance.conditionDefaults[group]=state.conditionDefaults[group];
  }
  const labels=initializeReportLabels(sections);
  for(const key of Object.keys(labels)) if(state.reportLabels[key])labels[key]=state.reportLabels[key];
  const draftKeys=new Set(sections.flatMap((section)=>section.phases.map((phase)=>`${conditionGroupKey(section)}:${phase}`)));
  const groupDrafts=Object.fromEntries(Object.entries(state.groupDrafts??{}).filter(([key])=>draftKeys.has(key)));
  return {...state,sections,photos:state.photos.map((photo)=>photo.sectionId
    ? remap.has(photo.sectionId)?{...photo,sectionId:remap.get(photo.sectionId)!}:{...photo,sectionId:null,phase:null}:photo),
    focusedSectionId:remap.get(state.focusedSectionId??'')??sections[0]?.id??null,...inheritance,conditionReviews:reviews,reportLabels:labels,workPerformLabels,groupDrafts};
}
