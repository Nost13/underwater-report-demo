import { describe, expect, it } from 'vitest';
import { DEMO_VESSELS } from './demoData';
import { deriveOperationValues, emptyReportInfo, formatWorkingTime, formatWorkWindow, reportInfoForScopes, reportInfoFromVessel } from './reportInfo';

describe('report information', () => {
  it('prefills Word fields from the selected IMO record', () => {
    expect(reportInfoFromVessel(DEMO_VESSELS[0]).vessel).toMatchObject({
      name: 'M.V. PACIFIC AURORA',
      imo: '9876543',
      type: 'Bulk Carrier',
    });
  });

  it('keeps one Word service row for each selected service in order', () => {
    expect(reportInfoForScopes(emptyReportInfo(), ['INSPECTION', 'POLISHING']).serviceItems)
      .toEqual(['Inspection', 'Polishing']);
  });

  it('calculates Work Window and Working Time from their date-time pairs', () => {
    expect(deriveOperationValues({
      ...emptyReportInfo().operation,
      eta: '2026-09-04T08:30',
      etd: '2026-09-05T20:00',
      start: '2026-09-04T22:15',
      end: '2026-09-05T01:45',
    })).toMatchObject({
      workWindow: '35 Hours + 1 Hrs',
      workingTime: '3 Hrs 30 Min',
    });
  });

  it('uses Berthing Side as Position except at an anchorage', () => {
    expect(deriveOperationValues({
      ...emptyReportInfo().operation,
      location: 'Busan / PNIT / 3',
      berthingSide: 'P',
    }).position).toBe('PORT SIDE');
    expect(deriveOperationValues({
      ...emptyReportInfo().operation,
      location: 'Busan Anchorage',
      berthingSide: 'STBD',
      position: 'ANCHORAGE A-1',
    }).position).toBe('ANCHORAGE A-1');
  });

  it('clears an automatically copied side when the location changes to an anchorage', () => {
    expect(deriveOperationValues({
      ...emptyReportInfo().operation,
      location: 'Busan Anchorage',
      berthingSide: 'PORT',
      position: 'PORT SIDE',
    }, 'location').position).toBe('');
  });

  it('calculates an overnight Working Time from time-only inputs', () => {
    expect(deriveOperationValues({
      ...emptyReportInfo().operation,
      start: '23:00',
      end: '01:30',
    }).workingTime).toBe('2 Hrs 30 Min');
  });

  it('adds the fixed one-hour allowance to the whole-hour work window', () => {
    expect(formatWorkWindow('2026-09-01T01:36', '2026-09-01T18:00'))
      .toBe('16 Hours + 1 Hrs');
  });

  it('formats working time with exact hours and minutes', () => {
    expect(formatWorkingTime('2026-09-01T15:35', '2026-09-01T16:24'))
      .toBe('0 Hrs 49 Min');
  });

  it('creates exact readiness defaults and two empty slots per record', () => {
    expect(emptyReportInfo().readiness).toMatchObject({
      toolboxNote: 'No safety concerns noted before operation .',
      preparationNote: 'No abnormal conditions observed at site.',
      toolboxPhotos: [null, null],
      preparationPhotos: [null, null],
    });
  });
});
