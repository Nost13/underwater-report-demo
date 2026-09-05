import { describe, expect, it } from 'vitest';
import type { ReportSection } from '../domain/types';
import { emptyReportInfo } from './reportInfo';
import { createCoverInfo, linkedCoverValues, syncGeneratedCoverScope } from './coverInfo';

const ropeRemovalSection: ReportSection = {
  id: 'REMOVAL/NICHE/ROPE',
  targetId: 'NICHE/ROPE',
  area: 'NICHE',
  component: 'Entanglement Rope & Fishing Net',
  service: 'REMOVAL',
  phases: ['BEFORE', 'AFTER'],
  conditions: {},
};

describe('cover information', () => {
  it('creates editable defaults with a local issue date and centered crop', () => {
    expect(createCoverInfo(new Date('2026-09-05T23:30:00+09:00'))).toEqual({
      issueDate: '2026-09-05',
      photoFile: null,
      crop: { focusX: 0.5, focusY: 0.5, zoom: 1 },
      scopeTitle: '',
      scopeDescription: '',
      scopeMode: 'AUTO',
    });
  });

  it('links report metadata without duplicating it into editable cover state', () => {
    const info = emptyReportInfo();
    info.vessel = { ...info.vessel, jobNo: 'US-CLS-2609003', name: 'MSC BEIJING VIII', imo: '9289099', callSign: 'CQEG5', ownerClient: 'MSC' };
    info.operation = { ...info.operation, start: '2026-09-04T08:00', eta: '2026-09-04T06:00', location: 'Busan Newport Pier 6' };
    expect(linkedCoverValues(info)).toEqual(expect.objectContaining({
      reportNo: 'US-CLS-2609003',
      vesselName: 'MSC BEIJING VIII',
      operationDate: '4 Sep 2026',
      location: 'Busan Newport Pier 6',
    }));
  });

  it('falls back to ETA and then a blank operation date', () => {
    const info = emptyReportInfo();
    info.operation.eta = '2026-09-04T06:00';
    expect(linkedCoverValues(info).operationDate).toBe('4 Sep 2026');
    info.operation.eta = '';
    expect(linkedCoverValues(info).operationDate).toBe('');
  });

  it('does not overwrite manually edited scope until regeneration is requested', () => {
    const manual = { ...createCoverInfo(new Date('2026-09-05')), scopeTitle: 'CUSTOM', scopeMode: 'MANUAL' as const };
    expect(syncGeneratedCoverScope(manual, [ropeRemovalSection])).toBe(manual);
    expect(syncGeneratedCoverScope(manual, [ropeRemovalSection], true).scopeTitle)
      .toBe('Removal of Entanglement Rope & Fishing Net');
  });

  it('generates matrix-ordered scope text while de-duplicating repeated entries', () => {
    const sections = [
      { ...ropeRemovalSection, id: 'a', side: 'PORT' as const, unit: 1 },
      { ...ropeRemovalSection, id: 'b', side: 'PORT' as const, unit: 1 },
      { ...ropeRemovalSection, id: 'c', component: 'Sea Chest', side: 'STBD' as const, unit: 2, service: 'CLEANING' as const },
    ];
    const result = syncGeneratedCoverScope(createCoverInfo(), sections);
    expect(result.scopeTitle).toBe('Removal of Entanglement Rope & Fishing Net; Cleaning of Sea Chest');
    expect(result.scopeDescription).toBe('Removal: Entanglement Rope & Fishing Net (PORT 1)\nCleaning: Sea Chest (STBD 2)');
  });
});
