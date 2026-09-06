import { expect, it } from 'vitest';
import { recommendLayout, replaceDiagramImage, diagramConfirmed, viewForSection, reconcileDiagramMarkers, type LayoutRecord } from './layoutLibrary';
import {createNicheSections} from '../domain/structure';
import {createDefaultHullMarkers,createDefaultNicheMarkers} from './geometry';
import {createGeneralTargets,createReportSections} from '../domain/structure';
import { DEFAULT_CALIBRATION, type VesselDiagramConfig } from './types';
const config = (x = .2): VesselDiagramConfig => ({ imageFile:new File(['x'],'ship.png'),imageName:'ship.png',calibration:{sternX:0,bowX:1,hullTopY:0,bottomY:1},hullMarkers:[],nicheMarkers:[{id:'sea-chest',groupId:'aft-services',shape:'RECTANGLE',rect:{x,y:.2,width:.1,height:.1}}],confirmed:true });
const record = (imo:string,x:number,time=1):LayoutRecord => ({id:`${imo}-${time}`,imo,vesselName:imo,vesselType:'Container Ship',loa:200,breadth:30,view:'SIDE',updatedAt:time,jobNo:'',config:config(x)});
const target = {imo:'9999999',vesselType:'Container Ship',loa:200,breadth:30,view:'SIDE' as const};
it('requires the bottom view for BOTTOM scope even with a forged side override',()=>{
 const section=createReportSections(createGeneralTargets().filter((item)=>item.side==='BOTTOM').map((item)=>({...item,services:['INSPECTION' as const]})))[0];
 const value={...config(),useBottomView:true,bottomView:{...config(),confirmed:false},sectionViews:{[section.id]:'SIDE' as const}};
 expect(viewForSection(value,section)).toBe('BOTTOM');expect(diagramConfirmed(value,[section])).toBe(false);
});
it('keeps all markers when an image is replaced and requires confirmation again', () => {
  const prior = config(); prior.calibration = DEFAULT_CALIBRATION;
  const next = replaceDiagramImage(prior,new File(['new'],'new.jpg'));
  expect(next.nicheMarkers).toEqual(prior.nicheMarkers);
  expect(next.calibration).toEqual(prior.calibration);
  expect(next.imageName).toBe('new.jpg'); expect(next.confirmed).toBe(false);
});
it('uses an arithmetic mean of unique vessels, not repeated saved jobs', () => {
  const result = recommendLayout(target,[record('1111111',.2),record('2222222',.3),record('3333333',.4),record('1111111',.2,2)],config());
  expect(result.markers[0].rect.x).toBeCloseTo(.3);
  expect(result.sources[0]).toMatchObject({origin:'MEAN',sampleCount:3});
});
it('prefers the same IMO, and excludes wrong view/type/size and unconfirmed records', () => {
  const records = [record('9999999',.6),{...record('1111111',.1),view:'BOTTOM' as const},{...record('2222222',.1),loa:260},{...record('3333333',.1),vesselType:'Tanker'}];
  expect(recommendLayout(target,records,config()).markers[0].rect.x).toBeCloseTo(.6);
  expect(recommendLayout({...target,imo:'8888888'},records.slice(1),config()).sources[0].origin).toBe('DEFAULT');
  const unconfirmed=record('1111111',.8); unconfirmed.config.confirmed=false;
  expect(recommendLayout(target,[unconfirmed],config()).sources[0].sampleCount).toBe(0);
});
it('holds an extreme sample and preserves its previous valid representative', () => {
  const records=[record('1111111',.2),record('2222222',.2),record('3333333',.2),record('4444444',.2),record('5555555',.2),record('5555555',.9,2)];
  const result=recommendLayout(target,records,config());
  expect(result.markers[0].rect.x).toBeCloseTo(.2);
  expect(result.heldOut).toContainEqual({recordId:'5555555-2',markerId:'sea-chest'});
});
it('calls a one-vessel estimate reference data rather than a well-sampled mean', () => {
  expect(recommendLayout(target,[record('1111111',.3)],config()).sources[0]).toMatchObject({origin:'REFERENCE',sampleCount:1});
});
it('preserves adjusted existing bilges and supplies only missing IDs for the current scope',()=>{
 const prior={...config(),calibration:DEFAULT_CALIBRATION,hullMarkers:createDefaultHullMarkers(DEFAULT_CALIBRATION),nicheMarkers:createDefaultNicheMarkers(DEFAULT_CALIBRATION,1)};
 const adjusted=prior.nicheMarkers.find(m=>m.id==='bilge-keel-1')!;adjusted.rect={x:.2,y:.5,width:.15,height:.02};
 const sections=createNicheSections({component:'Bilge Keel',type:'QUANTITY',quantity:2,service:'INSPECTION'});
 const next=reconcileDiagramMarkers(prior,sections);
 expect(next.nicheMarkers.find(m=>m.id===adjusted.id)).toEqual(adjusted);
 expect(next.nicheMarkers.filter(m=>m.id.startsWith('bilge-keel-'))).toHaveLength(2);expect(next.confirmed).toBe(false);
 expect(diagramConfirmed({...prior,confirmed:true},sections)).toBe(false);
 expect(diagramConfirmed({...next,confirmed:true},sections)).toBe(true);
});
