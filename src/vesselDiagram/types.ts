export const DIAGRAM_WIDTH = 2048;
export const DIAGRAM_HEIGHT = 488;

export type MarkerShape = 'RECTANGLE' | 'ELLIPSE' | 'CIRCLE';

export interface NormalizedRect { x: number; y: number; width: number; height: number }
export interface HullCalibration { sternX: number; bowX: number; hullTopY: number; bottomY: number }
export interface ZoneMarker { id: string; groupId: string; unit?: number; rect: NormalizedRect; shape: MarkerShape; label?: string; custom?: boolean }
export type MarkerGroupId =
  | 'hull' | 'propeller-group' | 'aft-services' | 'rudder-group' | 'fwd-services'
  | 'bulbous-bow' | 'transducer' | 'anode' | 'bilge-keel';
export interface RequiredMarkerGroup { id: MarkerGroupId; markerIds: string[] }
export interface VesselDiagramConfig {
  /** The root holds the uploaded bottom draft until a side image is provided. */
  sideViewPending?: boolean;
  markerBindings?: Record<string,string[]>;
  removedMarkerIds?: string[];
  imageFile: File;
  imageName: string;
  calibration: HullCalibration;
  hullMarkers: ZoneMarker[];
  nicheMarkers: ZoneMarker[];
  confirmed: boolean;
  imagePlacement?: NormalizedRect;
  imageAspectLocked?: boolean;
  bottomView?: VesselDiagramConfig;
  useBottomView?: boolean;
  sectionViews?: Record<string, 'SIDE' | 'BOTTOM'>;
}

export const DEFAULT_CALIBRATION: HullCalibration = { sternX: 0.08, bowX: 0.92, hullTopY: 0.15, bottomY: 0.86 };
