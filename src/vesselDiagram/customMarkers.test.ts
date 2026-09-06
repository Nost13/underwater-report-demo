import {expect,it} from 'vitest';
import {createBilgeKeelMarkers,createDefaultHullMarkers,createDefaultNicheMarkers} from './geometry';
import {DEFAULT_CALIBRATION,type VesselDiagramConfig} from './types';
import {resolveMarkerIds} from './markers';
import {diagramConfirmed,reconcileDiagramMarkers} from './layoutLibrary';
import {normalizeDiagramShapes} from './customMarkers';
import {validDiagram} from '../persistence/validateDiagram';
import type {ReportSection} from '../domain/types';
const section={id:'REMOVAL/NICHE/SEA CHEST',targetId:'NICHE/SEA CHEST',component:'SEA CHEST',area:'NICHE',service:'REMOVAL',phases:['BEFORE','AFTER'],conditions:{}} as ReportSection;
const config=():VesselDiagramConfig=>({imageFile:new File(['a'],'test.png'),imageName:'test.png',confirmed:true,calibration:{...DEFAULT_CALIBRATION},hullMarkers:createDefaultHullMarkers(DEFAULT_CALIBRATION),nicheMarkers:createDefaultNicheMarkers(DEFAULT_CALIBRATION,1)});
it('generates rectangular bilges and migrates old bilges without moving them',()=>{
 expect(createBilgeKeelMarkers(DEFAULT_CALIBRATION,2).map(m=>m.shape)).toEqual(['RECTANGLE','RECTANGLE']);
 const old=config();old.nicheMarkers.at(-1)!.shape='ELLIPSE';const rect={...old.nicheMarkers.at(-1)!.rect};
 const next=normalizeDiagramShapes({...old,bottomView:old});
 expect(next.nicheMarkers.at(-1)).toMatchObject({shape:'RECTANGLE',rect});
 expect(next.bottomView!.nicheMarkers.at(-1)).toMatchObject({shape:'RECTANGLE',rect});
 expect(old.nicheMarkers.at(-1)!.shape).toBe('ELLIPSE');
});
it('uses explicit custom bindings for output and confirmation, including deliberate disconnection',()=>{
 const view=config();view.nicheMarkers.push({id:'custom-1',groupId:'custom',custom:true,label:'Custom chest',shape:'CIRCLE',rect:{x:.3,y:.3,width:.03,height:.1}});
 view.markerBindings={[section.id]:['custom-1']};
 expect(resolveMarkerIds(section,view)).toEqual(['custom-1']);expect(diagramConfirmed(view,[section])).toBe(true);
 view.markerBindings[section.id]=[];
 expect(resolveMarkerIds(section,view)).toEqual([]);expect(diagramConfirmed(view,[section])).toBe(false);
});
it('keeps removed defaults absent and user markers intact when scope is reconciled',()=>{
 const view=config();view.nicheMarkers=view.nicheMarkers.filter(m=>m.id!=='aft-services');view.removedMarkerIds=['aft-services'];
 view.nicheMarkers.push({id:'custom-1',groupId:'custom',custom:true,label:'Custom',shape:'RECTANGLE',rect:{x:.2,y:.2,width:.1,height:.1}});
 const next=reconcileDiagramMarkers(view,[section]);
 expect(next.nicheMarkers.some(m=>m.id==='aft-services')).toBe(false);
 expect(next.nicheMarkers.find(m=>m.id==='custom-1')).toEqual(view.nicheMarkers.at(-1));
});
it('rejects malformed bindings and labels in saved diagrams',()=>{
 const view=config();
 expect(validDiagram({...view,markerBindings:{[section.id]:['missing']}})).toBe(false);
 expect(validDiagram({...view,markerBindings:{[section.id]:['aft-services','aft-services']}})).toBe(false);
 expect(validDiagram({...view,nicheMarkers:[{...view.nicheMarkers[0],label:12}]})).toBe(false);
});
