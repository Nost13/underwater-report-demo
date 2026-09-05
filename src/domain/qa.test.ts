import { describe, expect, it } from 'vitest';
import { createNicheSections } from './structure';
import { checkReport } from './qa';
import type { PhotoData } from './types';
import { createCoverInfo } from '../app/coverInfo';
import { emptyReportInfo } from '../app/reportInfo';

describe('report check issues', () => {
  it('lists missing cover photo and each linked field without inventing a section target', () => {
    const issues = checkReport([], [], createCoverInfo(), emptyReportInfo());
    expect(issues.map((issue) => issue.id)).toEqual([
      'cover:photo', 'cover:reportNo', 'cover:vesselName', 'cover:imoNumber',
      'cover:callSign', 'cover:ownerClient', 'cover:operationDate', 'cover:location',
    ]);
    expect(issues.every((issue) => issue.sectionId === null && /커버/.test(issue.message))).toBe(true);
    expect(issues[0].message).toContain('사진');
    expect(issues[1].message).toContain('Job No');
    expect(checkReport([], [])).toEqual([]);
  });

  it('clears cover issues for a photo and linked values, including the ETA fallback', () => {
    const cover = { ...createCoverInfo(), photoFile: new File(['photo'], 'cover.jpg') };
    const info = emptyReportInfo();
    Object.assign(info.vessel, { jobNo: 'JOB', name: 'VESSEL', imo: '123', callSign: 'CALL', ownerClient: 'OWNER' });
    Object.assign(info.operation, { start: '', eta: '2026-09-05T12:00', location: 'BUSAN' });
    expect(checkReport([], [], cover, info)).toEqual([]);
    info.operation.eta = 'invalid';
    info.vessel.jobNo = '  ';
    expect(checkReport([], [], cover, info).map((issue) => issue.id)).toEqual(['cover:reportNo', 'cover:operationDate']);
  });
  it('reports missing photos, missing conditions, unmatched files, and a large phase imbalance', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'CLEANING',
    });
    section.conditions.BEFORE = {
      fouling: { type: 'Medium Macro Fouling', coverage: null, slimeOnly: false },
      observed: { type: '', level: '' },
    };
    const photos: PhotoData[] = [1, 2, 3, 4].map((number) => ({
      id: `P${number}`,
      sectionId: section.id,
      phase: 'BEFORE',
      file: new File(['x'], `${number}.jpg`, { type: 'image/jpeg' }),
      reportUse: true,
      order: number,
      relativePath: `${number}.jpg`,
      captionText: '',
    }));
    photos.push({
      id: 'PX',
      sectionId: null,
      phase: null,
      file: new File(['x'], 'unknown.jpg', { type: 'image/jpeg' }),
      reportUse: true,
      order: 5,
      relativePath: 'misc/unknown.jpg',
      captionText: '',
    });

    expect(checkReport([section], photos).map((issue) => issue.kind)).toEqual(
      expect.arrayContaining([
        'MISSING_PHASE_PHOTO',
        'MISSING_CONDITION',
        'PHASE_IMBALANCE',
        'UNMATCHED',
      ]),
    );
    expect(checkReport([section], photos).find((issue) => issue.kind === 'UNMATCHED')?.message)
      .toBe('미배정 사진 1장을 배정하세요.');
  });

  it('accepts zero-percent Clean and a numeric Fouling Condition without an Observed Type', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    });
    section.conditions.CURRENT = {
      fouling: { type: 'Clean / No Fouling', coverage: 0, slimeOnly: false },
      observed: { type: '', level: '' },
    };

    const issues = checkReport([section], []);

    expect(issues.some((issue) => issue.kind === 'MISSING_CONDITION')).toBe(false);
  });

  it('requires entered coverage before Slime Only can become a valid condition', () => {
    const [section] = createNicheSections({
      component: 'Rudder',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    });
    section.conditions.CURRENT = {
      fouling: { type: 'Micro fouling', coverage: null, slimeOnly: true },
      observed: { type: '', level: 'Normal / Trace' },
    };

    const issues = checkReport([section], []);

    expect(issues.some((issue) => issue.kind === 'MISSING_CONDITION')).toBe(true);
  });

  it('identifies the Phase for photo and condition issues so Report Input can focus it', () => {
    const [section] = createNicheSections({
      component: 'Boss Cap',
      type: 'SINGLE',
      quantity: 1,
      service: 'CLEANING',
    });

    const issues = checkReport([section], []);

    expect(issues.find((issue) => issue.id.endsWith(':BEFORE'))?.phase).toBe('BEFORE');
    expect(issues.find((issue) => issue.id.endsWith(':AFTER'))?.phase).toBe('AFTER');
  });

  it('focuses a phase imbalance on the side with fewer Report Use photos', () => {
    const [section] = createNicheSections({
      component: 'Boss Cap',
      type: 'SINGLE',
      quantity: 1,
      service: 'CLEANING',
    });
    const photos: PhotoData[] = [1, 2, 3, 4].map((number) => ({
      id: `P${number}`,
      sectionId: section.id,
      phase: 'BEFORE',
      file: new File(['x'], `${number}.jpg`, { type: 'image/jpeg' }),
      reportUse: true,
      order: number,
      relativePath: `${number}.jpg`,
      captionText: '',
    }));

    const imbalance = checkReport([section], photos)
      .find((issue) => issue.kind === 'PHASE_IMBALANCE');

    expect(imbalance?.phase).toBe('AFTER');
  });
});
