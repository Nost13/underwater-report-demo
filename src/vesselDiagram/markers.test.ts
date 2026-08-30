import { describe, expect, it } from 'vitest';
import type { ReportSection } from '../domain/types';
import { markersForSection, requiredMarkerGroups, resolveMarkerIds, bilgeQuantityFromSections } from './markers';
import type { VesselDiagramConfig } from './types';

const section = (component: string, side?: ReportSection['side'], unit?: number, area?: ReportSection['area']): ReportSection => ({
  id: `${area}/${component}`,
  targetId: `${area}/${component}`,
  area: area ?? (['FWD', 'FWD-MID', 'MID', 'MID-AFT', 'AFT'].includes(component.trim().toUpperCase()) ? 'GENERAL' : 'NICHE'),
  component,
  side,
  unit,
  service: 'INSPECTION',
  phases: ['CURRENT'],
  conditions: {},
});

describe('resolveMarkerIds', () => {
  it.each([
    ['FWD', ['hull-fwd']], ['FWD-MID', ['hull-fwd-mid']], ['MID', ['hull-mid']], ['MID-AFT', ['hull-mid-aft']], ['AFT', ['hull-aft']],
    ['PROPELLER BLADE', ['propeller-group']], ['FIN BLADE', ['propeller-group']], ['STERN FRAME', ['propeller-group']], ['ROPE GUARD', ['propeller-group']], ['BOSS CAP', ['propeller-group']],
    ['SEA CHEST', ['aft-services']], ['DISCHARGE PIPE', ['aft-services']], ['RUDDER & PINTLE', ['rudder-group']], ['BOW THRUSTER', ['fwd-services']], ['BULBOUS BOW', ['bulbous-bow']],
    ['TRANSDUCER', ['transducer-aft', 'transducer-fwd']], ['ANODE / ICCP', ['anode-aft', 'anode-fwd']],
  ])('%s resolves independently from report labels', (component, expected) => {
    expect(resolveMarkerIds(section(component))).toEqual(expected);
  });

  it('resolves Bilge Keel by unit and shares PORT/STBD geometry', () => {
    expect(resolveMarkerIds(section('BILGE KEEL', 'PORT', 2))).toEqual(['bilge-keel-2']);
    expect(resolveMarkerIds(section('BILGE KEEL', 'STBD', 2))).toEqual(['bilge-keel-2']);
  });

  it('normalizes component whitespace and case and supports the rudder alias', () => {
    expect(resolveMarkerIds(section('  rudder  '))).toEqual(['rudder-group']);
    expect(resolveMarkerIds(section(' unknown '))).toEqual([]);
  });
});

describe('required marker groups and bilge quantity', () => {
  it('merges shared locations in first occurrence order', () => {
    const groups = requiredMarkerGroups([section('ANODE / ICCP'), section('PROPELLER BLADE'), section('TRANSDUCER'), section('BILGE KEEL', 'PORT', 2), section('BILGE KEEL', 'STBD', 1)]);
    expect(groups).toEqual([
      { id: 'anode', markerIds: ['anode-aft', 'anode-fwd'] },
      { id: 'propeller-group', markerIds: ['propeller-group'] },
      { id: 'transducer', markerIds: ['transducer-aft', 'transducer-fwd'] },
      { id: 'bilge-keel', markerIds: ['bilge-keel-2', 'bilge-keel-1'] },
    ]);
  });

  it('derives maximum bilge unit, defaulting to one only when bilge is present', () => {
    expect(bilgeQuantityFromSections([section('BILGE KEEL', 'PORT', 2), section('BILGE KEEL', 'STBD', 4)])).toBe(4);
    expect(bilgeQuantityFromSections([section('BILGE KEEL')])).toBe(1);
    expect(bilgeQuantityFromSections([section('SEA CHEST')])).toBe(0);
  });
});

describe('markersForSection', () => {
  it('returns only configured markers matching the section IDs', () => {
    const markers = [{ id: 'hull-fwd', groupId: 'hull' }, { id: 'propeller-group', groupId: 'propeller-group' }, { id: 'other', groupId: 'other' }] as VesselDiagramConfig['hullMarkers'];
    const config = { hullMarkers: markers, nicheMarkers: [] } as unknown as VesselDiagramConfig;
    expect(markersForSection(config, section('FWD', undefined, undefined, 'GENERAL'))).toEqual([markers[0]]);
  });
});
