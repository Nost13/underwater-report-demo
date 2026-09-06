import type {VesselDiagramConfig} from '../vesselDiagram/types';
import {isValidCalibration,isValidRect} from '../vesselDiagram/geometry';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function validDiagram(value:unknown,depth=0):value is VesselDiagramConfig {
  if(!object(value)||depth>1)return false;
  const diagram=value as unknown as VesselDiagramConfig;
  if(!(diagram.imageFile instanceof File)||typeof diagram.imageName!=='string'||typeof diagram.confirmed!=='boolean'||!object(diagram.calibration)||!isValidCalibration(diagram.calibration)
    ||!Array.isArray(diagram.hullMarkers)||!Array.isArray(diagram.nicheMarkers))return false;
  const markers=[...diagram.hullMarkers,...diagram.nicheMarkers];
  if(new Set(markers.map((marker)=>marker?.id)).size!==markers.length||markers.some((marker)=>!object(marker)||typeof marker.id!=='string'||typeof marker.groupId!=='string'||(marker.unit!==undefined&&(!Number.isSafeInteger(marker.unit)||marker.unit<1))||!['CIRCLE','ELLIPSE','RECTANGLE'].includes(marker.shape)||!object(marker.rect)||!isValidRect(marker.rect)))return false;
  if(diagram.imagePlacement){const p=diagram.imagePlacement;if(!object(p)||![p.x,p.y,p.width,p.height].every(Number.isFinite)||Math.abs(p.x)>4||Math.abs(p.y)>4||p.width<=0||p.height<=0||p.width>4||p.height>4)return false;}
  if(diagram.bottomView!==undefined&&!validDiagram(diagram.bottomView,depth+1))return false;
  if(diagram.useBottomView!==undefined&&typeof diagram.useBottomView!=='boolean')return false;
  if(diagram.imageAspectLocked!==undefined&&typeof diagram.imageAspectLocked!=='boolean')return false;
  if(diagram.sectionViews!==undefined&&(!object(diagram.sectionViews)||Object.values(diagram.sectionViews).some((view)=>view!=='SIDE'&&view!=='BOTTOM')))return false;
  return true;
}
