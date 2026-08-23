import { describe, expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
import { exportReportPdf } from './exportReport';

describe('sequential PDF export', () => {
  it('processes one image at a time and reports unreadable file names', async () => {
    const section = createNicheSections({
      component: 'Boss Cap',
      type: 'SINGLE',
      quantity: 1,
      service: 'CLEANING',
    })[0];
    const photos: PhotoData[] = ['a.jpg', 'bad.jpg', 'c.jpg'].map((name, index) => ({
      id: `P${index}`,
      sectionId: section.id,
      phase: index < 2 ? 'BEFORE' : 'AFTER',
      file: new File(['x'], name, { type: 'image/jpeg' }),
      reportUse: true,
      order: index,
      relativePath: name,
    }));
    let active = 0;
    let maximum = 0;
    const renderedText: string[] = [];
    const result = await exportReportPdf(
      { vesselName: 'M.V. TEST', sections: [section], photos },
      {
        resize: async (file) => {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          if (file.name === 'bad.jpg') throw new Error('decode');
          return new Uint8Array([1, 2, 3]);
        },
        createPdf: () => ({
          addPage() {}, setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {},
          setFont() {}, text(value: string) { renderedText.push(value); }, addImage() {}, save() {},
        }),
      },
    );
    expect(maximum).toBe(1);
    expect(result.skipped).toEqual(['bad.jpg']);
    expect(renderedText).toEqual(expect.arrayContaining(['BEFORE', 'AFTER']));
  });

  it('draws an explicit CURRENT badge for Inspection photos', async () => {
    const section = createNicheSections({
      component: 'Boss Cap',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    })[0];
    const renderedText: string[] = [];
    await exportReportPdf(
      {
        vesselName: 'M.V. TEST',
        sections: [section],
        photos: [{
          id: 'CURRENT-1', sectionId: section.id, phase: 'CURRENT',
          file: new File(['x'], 'current.jpg', { type: 'image/jpeg' }),
          reportUse: true, order: 1, relativePath: 'current.jpg',
        }],
      },
      {
        resize: async () => new Uint8Array([1, 2, 3]),
        createPdf: () => ({
          addPage() {}, setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {},
          setFont() {}, text(value: string) { renderedText.push(value); }, addImage() {}, save() {},
        }),
      },
    );
    expect(renderedText).toContain('CURRENT');
  });

  it('labels every page with the service assigned to its section', async () => {
    const cleaning = createNicheSections({
      component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING',
    })[0];
    const inspection = createNicheSections({
      component: 'Stern Frame', type: 'SINGLE', quantity: 1, service: 'INSPECTION',
    })[0];
    const renderedText: string[] = [];
    const savedNames: string[] = [];
    await exportReportPdf(
      {
        vesselName: 'M.V. TEST', sections: [cleaning, inspection],
        photos: [
          { id: 'C1', sectionId: cleaning.id, phase: 'BEFORE', file: new File(['x'], 'cleaning.jpg', { type: 'image/jpeg' }), reportUse: true, order: 1, relativePath: 'cleaning.jpg' },
          { id: 'I1', sectionId: inspection.id, phase: 'CURRENT', file: new File(['x'], 'inspection.jpg', { type: 'image/jpeg' }), reportUse: true, order: 2, relativePath: 'inspection.jpg' },
        ],
      },
      {
        resize: async () => new Uint8Array([1, 2, 3]),
        createPdf: () => ({
          addPage() {}, setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {},
          setFont() {}, text(value: string) { renderedText.push(value); }, addImage() {}, save(value: string) { savedNames.push(value); },
        }),
      },
    );
    expect(renderedText).toEqual(expect.arrayContaining([
      'M.V. TEST  |  CLEANING',
      'M.V. TEST  |  INSPECTION',
    ]));
    expect(savedNames).toEqual(['M_V_TEST_MULTI_SERVICE.pdf']);
  });
});
