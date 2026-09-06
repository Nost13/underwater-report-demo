import type { ReportSection } from '../domain/types';
import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH, type HullCalibration, type VesselDiagramConfig, type ZoneMarker } from './types';
import { isValidCalibration, isValidRect, createDefaultHullMarkers, createDefaultNicheMarkers } from './geometry';
import {bilgeQuantityFromSections,resolveMarkerIds} from './markers';
import {validDiagram} from '../persistence/validateDiagram';

export type DiagramView = 'SIDE' | 'BOTTOM';
export interface LayoutTarget { imo: string; vesselType: string; loa: number; breadth: number; view: DiagramView }
export interface LayoutRecord extends LayoutTarget {
  id: string; vesselName: string; updatedAt: number; jobNo: string; config: VesselDiagramConfig;
  excluded?: boolean; acceptedOutliers?: string[]; typeDefault?: boolean;
}
export interface LayoutSource { markerId: string; origin: 'IMO' | 'MEAN' | 'REFERENCE' | 'TYPE' | 'DEFAULT'; sampleCount: number; updatedAt?: number }
export interface LayoutRecommendation { markers: ZoneMarker[]; sources: LayoutSource[]; heldOut: Array<{recordId:string;markerId:string}> }

export const replaceDiagramImage = (config: VesselDiagramConfig, imageFile: File): VesselDiagramConfig => ({ ...config, imageFile, imageName: imageFile.name, confirmed: false });
export function reconcileDiagramMarkers(config:VesselDiagramConfig,sections:ReportSection[],unconfirm=false):VesselDiagramConfig {
  const quantity=bilgeQuantityFromSections(sections);
  const merge=(existing:ZoneMarker[],defaults:ZoneMarker[])=>{
    const retained=existing.filter(marker=>!marker.id.startsWith('bilge-keel-')||Number(marker.id.slice('bilge-keel-'.length))<=quantity);
    return [...retained,...defaults.filter(marker=>!retained.some(item=>item.id===marker.id))];
  };
  const hullMarkers=merge(config.hullMarkers,createDefaultHullMarkers(config.calibration));
  const nicheMarkers=merge(config.nicheMarkers,createDefaultNicheMarkers(config.calibration,quantity));
  const changed=hullMarkers.length!==config.hullMarkers.length||nicheMarkers.length!==config.nicheMarkers.length||hullMarkers.some((m,i)=>m!==config.hullMarkers[i])||nicheMarkers.some((m,i)=>m!==config.nicheMarkers[i]);
  return {...config,hullMarkers,nicheMarkers,confirmed:unconfirm||changed?false:config.confirmed};
}
export function viewForSection(config: VesselDiagramConfig, section: ReportSection): DiagramView {
  if(section.side==='BOTTOM'&&(config.useBottomView===true||(config.bottomView&&config.useBottomView!==false)))return 'BOTTOM';
  return config.sectionViews?.[section.id] ?? (section.side === 'BOTTOM' && (config.useBottomView === true || (config.bottomView && config.useBottomView !== false)) ? 'BOTTOM' : 'SIDE');
}
export function diagramForSection(config: VesselDiagramConfig, section: ReportSection): VesselDiagramConfig {
  if (viewForSection(config, section) === 'SIDE') return config;
  if (!config.bottomView) throw new Error('VESSEL_BOTTOM_VIEW_MISSING');
  return config.bottomView;
}
export function diagramConfirmed(config: VesselDiagramConfig | null | undefined, sections: ReportSection[]): boolean {
  if (!config) return false;
  return sections.length ? sections.every((section) => {
    try { const view=diagramForSection(config, section);const markers=[...view.hullMarkers,...view.nicheMarkers];const ids=resolveMarkerIds(section);return view.confirmed&&isValidCalibration(view.calibration)&&ids.length>0&&ids.every(id=>markers.some(marker=>marker.id===id&&isValidRect(marker.rect))); } catch { return false; }
  }) : config.confirmed;
}

export function vesselTypeKey(value: string): string {
  const name = value.trim().toUpperCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  const aliases: Record<string,string> = { 'CONTAINER SHIP':'CONTAINER', 'CONTAINER VESSEL':'CONTAINER', 'CONTAINER CARRIER':'CONTAINER', '컨테이너선':'CONTAINER', 'BULK CARRIER':'BULK', 'BULK CARGO':'BULK', '벌크선':'BULK', 'OIL TANKER':'TANKER', '유조선':'TANKER' };
  return aliases[name] ?? name;
}
function markerKey(marker: ZoneMarker, config: VesselDiagramConfig): string {
  const count = marker.id.startsWith('bilge-keel') ? config.nicheMarkers.filter((item) => item.id.startsWith('bilge-keel')).length : '';
  return `${marker.id}|${marker.groupId}|${marker.unit ?? ''}|${marker.shape}|${count}`;
}
function vector(marker: ZoneMarker, frame: HullCalibration): number[] {
  const length = frame.bowX-frame.sternX, height=frame.bottomY-frame.hullTopY;
  const rect = marker.rect;
  const width = marker.shape==='CIRCLE' ? Math.min(rect.width, rect.height*DIAGRAM_HEIGHT/DIAGRAM_WIDTH) : rect.width;
  return [(rect.x+rect.width/2-frame.sternX)/length,(rect.y+rect.height/2-frame.hullTopY)/height,width/length,marker.shape==='CIRCLE'?width/length:rect.height/height];
}
function fromVector(marker: ZoneMarker, values:number[], frame:HullCalibration): ZoneMarker {
  const length=frame.bowX-frame.sternX, height=frame.bottomY-frame.hullTopY;
  const w=values[2]*length, h=marker.shape==='CIRCLE'?w*DIAGRAM_WIDTH/DIAGRAM_HEIGHT:values[3]*height;
  return {...marker,rect:{x:frame.sternX+values[0]*length-w/2,y:frame.hullTopY+values[1]*height-h/2,width:w,height:h}};
}
const median = (values:number[]) => { const sorted=[...values].sort((a,b)=>a-b); const m=Math.floor(sorted.length/2); return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2; };

export function recommendLayout(target: LayoutTarget, records: LayoutRecord[], base: VesselDiagramConfig): LayoutRecommendation {
  const result: LayoutRecommendation = {markers:[],sources:[],heldOut:[]};
  const eligible=records.filter((record)=>!record.excluded && record.config.confirmed && record.view===target.view && isValidCalibration(record.config.calibration)).sort((a,b)=>b.updatedAt-a.updatedAt);
  const targetType=vesselTypeKey(target.vesselType);
  const sized=targetType && target.loa>0 && target.breadth>0;
  for (const marker of [...base.hullMarkers,...base.nicheMarkers]) {
    const key=markerKey(marker,base);
    const candidates=eligible.flatMap((record)=> {
      const item=[...record.config.hullMarkers,...record.config.nicheMarkers].find((candidate)=>markerKey(candidate,record.config)===key && isValidRect(candidate.rect));
      return item?[{record,values:vector(item,record.config.calibration)}]:[];
    });
    const exact=candidates.find(({record})=>target.imo && record.imo===target.imo && !record.typeDefault);
    let output: ZoneMarker|undefined, source:LayoutSource|undefined;
    if (exact) { output=fromVector(marker,exact.values,base.calibration); source={markerId:marker.id,origin:'IMO',sampleCount:1,updatedAt:exact.record.updatedAt}; }
    if (!output && sized) {
      const matched=candidates.filter(({record})=>!record.typeDefault && /^\d{7}$/.test(record.imo) && vesselTypeKey(record.vesselType)===targetType
        && record.loa>=target.loa*.8 && record.loa<=target.loa*1.2 && record.breadth>=target.breadth*.8 && record.breadth<=target.breadth*1.2);
      const unique=new Map<string,typeof matched[number]>();
      for(const sample of matched) if(!unique.has(sample.record.imo)) unique.set(sample.record.imo,sample);
      let samples=[...unique.values()];
      if(samples.length>=5) {
        const med=[0,1,2,3].map((i)=>median(samples.map((sample)=>sample.values[i])));
        const thresholds=med.map((m,i)=>Math.max(3*1.4826*median(samples.map((sample)=>Math.abs(sample.values[i]-m))),.05));
        const outside=(sample:typeof samples[number])=>!sample.record.acceptedOutliers?.includes(marker.id) && sample.values.some((v,i)=>Math.abs(v-med[i])>thresholds[i]);
        samples=samples.flatMap((sample)=> {
          if(!outside(sample)) return [sample];
          result.heldOut.push({recordId:sample.record.id,markerId:marker.id});
          const previous=matched.find((candidate)=>candidate.record.imo===sample.record.imo && candidate.record.updatedAt<sample.record.updatedAt && !outside(candidate));
          return previous?[previous]:[];
        });
      }
      if(samples.length) {
        const mean=[0,1,2,3].map((i)=>samples.reduce((sum,sample)=>sum+sample.values[i],0)/samples.length);
        output=fromVector(marker,mean,base.calibration);
        source={markerId:marker.id,origin:samples.length>=3?'MEAN':'REFERENCE',sampleCount:samples.length,updatedAt:Math.max(...samples.map((sample)=>sample.record.updatedAt))};
      }
    }
    if(!output) {
      const fallback=candidates.find(({record})=>record.typeDefault && targetType && vesselTypeKey(record.vesselType)===targetType);
      if(fallback) {output=fromVector(marker,fallback.values,base.calibration);source={markerId:marker.id,origin:'TYPE',sampleCount:0,updatedAt:fallback.record.updatedAt};}
    }
    if(!output || !isValidRect(output.rect)) {output=marker;source={markerId:marker.id,origin:'DEFAULT',sampleCount:0};}
    result.markers.push(output); result.sources.push(source!);
  }
  return result;
}

export function validateLayoutRecords(value: unknown): LayoutRecord[] {
  if (!Array.isArray(value) || value.length>5000) throw new Error('배치 기록 파일 형식이 올바르지 않습니다.');
  for(const item of value as LayoutRecord[]) {
    if(!item || typeof item.id!=='string' || typeof item.imo!=='string' || !/^\d{7}$/.test(item.imo) || typeof item.vesselName!=='string' || typeof item.vesselType!=='string'
      || !['SIDE','BOTTOM'].includes(item.view) || ![item.loa,item.breadth,item.updatedAt].every(Number.isFinite) || !item.config?.confirmed
      || typeof item.jobNo!=='string' || !validDiagram(item.config) || (item.excluded!==undefined&&typeof item.excluded!=='boolean') || (item.typeDefault!==undefined&&typeof item.typeDefault!=='boolean') || (item.acceptedOutliers!==undefined&&(!Array.isArray(item.acceptedOutliers)||item.acceptedOutliers.some((id)=>typeof id!=='string')))
      || !(item.config.imageFile instanceof File) || !isValidCalibration(item.config.calibration) || !Array.isArray(item.config.hullMarkers) || !Array.isArray(item.config.nicheMarkers)
      || [...item.config.hullMarkers,...item.config.nicheMarkers].some((marker)=>!marker || typeof marker.id!=='string' || !['CIRCLE','ELLIPSE','RECTANGLE'].includes(marker.shape) || !isValidRect(marker.rect))) throw new Error('배치 기록 데이터가 올바르지 않습니다.');
  }
  return value as LayoutRecord[];
}
