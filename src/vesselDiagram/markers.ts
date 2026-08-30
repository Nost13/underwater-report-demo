import type { ReportSection } from '../domain/types';
import type { MarkerGroupId, RequiredMarkerGroup, VesselDiagramConfig, ZoneMarker } from './types';

const GENERAL_MARKERS: Record<string, string> = {
  FWD: 'hull-fwd', 'FWD-MID': 'hull-fwd-mid', MID: 'hull-mid', 'MID-AFT': 'hull-mid-aft', AFT: 'hull-aft',
};
const NICHE_MARKERS: Record<string, string[]> = {
  'PROPELLER BLADE': ['propeller-group'], 'FIN BLADE': ['propeller-group'], 'STERN FRAME': ['propeller-group'],
  'ROPE GUARD': ['propeller-group'], 'BOSS CAP': ['propeller-group'], 'SEA CHEST': ['aft-services'],
  'DISCHARGE PIPE': ['aft-services'], 'RUDDER & PINTLE': ['rudder-group'], RUDDER: ['rudder-group'],
  'BOW THRUSTER': ['fwd-services'], 'BULBOUS BOW': ['bulbous-bow'], TRANSDUCER: ['transducer-aft', 'transducer-fwd'],
  'ANODE / ICCP': ['anode-aft', 'anode-fwd'],
};
const canonical = (component: string) => component.trim().toUpperCase();

export function resolveMarkerIds(section: ReportSection): string[] {
  const component = canonical(section.component);
  if (section.area === 'GENERAL') return GENERAL_MARKERS[component] ? [GENERAL_MARKERS[component]] : [];
  if (component === 'BILGE KEEL') return [`bilge-keel-${Math.max(1, section.unit ?? 1)}`];
  return NICHE_MARKERS[component] ?? [];
}

const groupFor = (id: string): MarkerGroupId => {
  if (id.startsWith('hull-')) return 'hull';
  if (id.startsWith('transducer-')) return 'transducer';
  if (id.startsWith('anode-')) return 'anode';
  if (id.startsWith('bilge-keel-')) return 'bilge-keel';
  return id as MarkerGroupId;
};

export function requiredMarkerGroups(sections: ReportSection[]): RequiredMarkerGroup[] {
  const groups: RequiredMarkerGroup[] = [];
  const byId = new Map<MarkerGroupId, RequiredMarkerGroup>();
  for (const section of sections) {
    const ids = resolveMarkerIds(section);
    for (const markerId of ids) {
      const id = groupFor(markerId);
      let group = byId.get(id);
      if (!group) { group = { id, markerIds: [] }; byId.set(id, group); groups.push(group); }
      if (!group.markerIds.includes(markerId)) group.markerIds.push(markerId);
    }
  }
  return groups;
}

export function bilgeQuantityFromSections(sections: ReportSection[]): number {
  const bilge = sections.filter((section) => canonical(section.component) === 'BILGE KEEL');
  if (!bilge.length) return 0;
  return Math.max(1, ...bilge.map((section) => Number.isFinite(section.unit) ? Math.floor(section.unit as number) : 1));
}

export function markersForSection(config: VesselDiagramConfig, section: ReportSection): ZoneMarker[] {
  const ids = new Set(resolveMarkerIds(section));
  return [...config.hullMarkers, ...config.nicheMarkers].filter((marker) => ids.has(marker.id));
}

export type { MarkerGroupId, RequiredMarkerGroup };
