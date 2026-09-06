import type {VesselDiagramConfig,ZoneMarker} from './types';
export const normalizeMarkerShape=(marker:ZoneMarker):ZoneMarker=>
  !marker.custom && (marker.groupId==='bilge-keel'||marker.id.startsWith('bilge-keel-')) && marker.shape!=='RECTANGLE'
    ? {...marker,shape:'RECTANGLE'} : marker;
export function normalizeDiagramShapes(config:VesselDiagramConfig):VesselDiagramConfig {
  return {...config,hullMarkers:config.hullMarkers.map(normalizeMarkerShape),nicheMarkers:config.nicheMarkers.map(normalizeMarkerShape),...(config.bottomView?{bottomView:normalizeDiagramShapes(config.bottomView)}:{})};
}
