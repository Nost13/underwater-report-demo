import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
import { writeTemplateReport } from './templateWriter';

const templatePath = 'public/templates/Detail_report_template.docx';

describe('bundled Detail report template', () => {
  it('preserves header and footer and renders first plus continuation pages', async () => {
    const templateBytes = await readFile(templatePath);
    const original = await JSZip.loadAsync(templateBytes);
    const originalHeaders = await Promise.all(
      Object.keys(original.files)
        .filter((path) => /^word\/header\d+\.xml$/.test(path))
        .map(async (path) => [path, await original.file(path)?.async('uint8array')] as const),
    );
    const originalFooters = await Promise.all(
      Object.keys(original.files)
        .filter((path) => /^word\/footer\d+\.xml$/.test(path))
        .map(async (path) => [path, await original.file(path)?.async('uint8array')] as const),
    );
    const section = createNicheSections({
      component: 'Propeller Blade',
      type: 'QUANTITY',
      quantity: 1,
      service: 'POLISHING',
    })[0];
    section.conditions.BEFORE = {
      fouling: { coverage: 70, slimeOnly: true, type: 'Micro fouling' },
      observed: { level: 'Normal / Trace', type: '' },
    };
    const photos: PhotoData[] = Array.from({ length: 5 }, (_, index) => ({
      id: `P${index + 1}`,
      sectionId: section.id,
      phase: 'BEFORE',
      reportUse: true,
      order: index + 1,
      relativePath: `P${index + 1}.jpg`,
      file: new File(['image'], `P${index + 1}.jpg`, { type: 'image/jpeg' }),
    }));

    const result = await writeTemplateReport({
      vesselName: 'MSC TEST',
      sections: [section],
      photos,
      templateUrl: 'templates/Detail_report_template.docx',
    }, {
      fetchTemplate: async () => Uint8Array.from(templateBytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });

    const output = await JSZip.loadAsync(result.blob);
    const documentXml = await output.file('word/document.xml')?.async('text') ?? '';
    const documentText = new DOMParser()
      .parseFromString(documentXml, 'application/xml')
      .documentElement.textContent ?? '';
    expect(result.pageCount).toBe(2);
    expect(documentText.match(/7\. DETAILED SERVICE RECORD/g)).toHaveLength(2);
    expect(documentText).toContain('NICHE AREAS & COMPONENTS / PROPELLER BLADE');
    expect(documentText).toContain('PROPELLER BLADE 1 (Before)');
    expect(documentText).toContain('Propeller Polishing');
    expect(documentText).toContain('70%');
    expect(documentXml).not.toMatch(/\{\{(?:P\d+|BC|TITLE|WORK|FT|FC|OL|OT|SIDE_LABEL)\}\}|@(?:FR|OR)/);
    expect(documentXml.match(/<w:sectPr(?:\s|>)/g)).toHaveLength(1);
    for (let index = 1; index <= 5; index += 1) {
      expect(output.file(`word/media/image${index}.jpg`)).not.toBeNull();
    }
    for (const [path, bytes] of [...originalHeaders, ...originalFooters]) {
      expect(await output.file(path)?.async('uint8array')).toEqual(bytes);
    }
  });
});
