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
    const originalStyles = await original.file('word/styles.xml')?.async('uint8array');
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
    expect(documentText).toContain('NICHE AREAS & COMPONENTS / PROPELLER');
    expect(documentText).toContain('PROPELLER BLADE 1 (Before)');
    expect(documentText).toContain('Polishing');
    expect(documentText).not.toContain('Propeller Polishing');
    expect(documentText).toContain('70%');
    expect(documentXml).not.toMatch(/\{\{(?:P\d+|BC|TITLE|WORK|FT|FC|OL|OT|SIDE_LABEL)\}\}|@(?:FR|OR)/);
    expect(documentXml.match(/<w:sectPr(?:\s|>)/g)).toHaveLength(1);
    for (let index = 1; index <= 5; index += 1) {
      expect(output.file(`word/media/image${index}.jpg`)).not.toBeNull();
    }
    for (const [path, bytes] of [...originalHeaders, ...originalFooters]) {
      expect(await output.file(path)?.async('uint8array')).toEqual(bytes);
    }
    expect(await output.file('word/styles.xml')?.async('uint8array')).toEqual(originalStyles);
    expect(documentXml).not.toContain('w:type="page"');
    expect(documentXml.match(/pageBreakBefore/g)).toHaveLength(1);
  });

  it('fills the gray image cell above the component caption and colors both rating cells', async () => {
    const templateBytes = await readFile(templatePath);
    const section = createNicheSections({
      component: 'Rope Guard',
      type: 'SINGLE',
      quantity: 1,
      service: 'CLEANING',
    })[0];
    section.conditions.BEFORE = {
      fouling: { coverage: 40, slimeOnly: false, type: 'Heavy Macro fouling' },
      observed: { level: 'Normal / Trace', type: '' },
    };
    const photo: PhotoData = {
      id: 'RG1',
      sectionId: section.id,
      phase: 'BEFORE',
      reportUse: true,
      order: 1,
      relativePath: 'RG1.jpg',
      file: new File(['image'], 'RG1.jpg', { type: 'image/jpeg' }),
    };

    const result = await writeTemplateReport({
      vesselName: 'MSC TEST',
      sections: [section],
      photos: [photo],
      templateUrl: 'templates/Detail_report_template.docx',
    }, {
      fetchTemplate: async () => Uint8Array.from(templateBytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });

    const output = await JSZip.loadAsync(result.blob);
    const documentXml = await output.file('word/document.xml')?.async('text') ?? '';
    const document = new DOMParser().parseFromString(documentXml, 'application/xml');
    const rows = Array.from(document.getElementsByTagNameNS('*', 'tr'));
    const captionRow = rows.find((row) => row.textContent?.includes('Rope Guard'));
    expect(captionRow).toBeDefined();
    expect(captionRow?.getElementsByTagNameNS('*', 'drawing')).toHaveLength(0);
    const imageRow = captionRow?.previousElementSibling;
    expect(imageRow?.getElementsByTagNameNS('*', 'drawing')).toHaveLength(1);
    expect(imageRow?.getElementsByTagNameNS('*', 'shd')[0]?.getAttributeNS(
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'fill',
    )).toBe('F2F2F2');
    const extent = imageRow?.getElementsByTagNameNS('*', 'extent')[0];
    expect(extent?.getAttribute('cx')).toBe('3236400');
    expect(extent?.getAttribute('cy')).toBe('2340000');

    const ratingCells = Array.from(document.getElementsByTagNameNS('*', 'tc'))
      .filter((cell) => ['4', '1'].includes(cell.textContent?.trim() ?? ''));
    const fillFor = (rating: string) => ratingCells
      .find((cell) => cell.textContent?.trim() === rating)
      ?.getElementsByTagNameNS('*', 'shd')[0]
      ?.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'fill');
    expect(fillFor('4')).toBe('E34217');
    expect(fillFor('1')).toBe('02AE4F');
  });

  it.each([
    [0, false, '0', '00AEE5'],
    [70, true, '1', '02AE4F'],
    [5, false, '2', 'FFBD23'],
    [25, false, '3', 'FF7A00'],
    [40, false, '4', 'E34217'],
    [70, false, '5', 'BD1820'],
  ])('exports coverage %i with the matching R%s color', async (coverage, slimeOnly, rating, expectedFill) => {
    const templateBytes = await readFile(templatePath);
    const section = createNicheSections({
      component: 'Rope Guard',
      type: 'SINGLE',
      quantity: 1,
      service: 'INSPECTION',
    })[0];
    section.conditions.CURRENT = {
      fouling: { coverage, slimeOnly, type: '' },
      observed: { level: 'Normal / Trace', type: '' },
    };
    const photo: PhotoData = {
      id: 'RATING',
      sectionId: section.id,
      phase: 'CURRENT',
      reportUse: true,
      order: 1,
      relativePath: 'RATING.jpg',
      file: new File(['image'], 'RATING.jpg', { type: 'image/jpeg' }),
    };
    const result = await writeTemplateReport({
      vesselName: 'MSC TEST',
      sections: [section],
      photos: [photo],
      templateUrl: 'templates/Detail_report_template.docx',
    }, {
      fetchTemplate: async () => Uint8Array.from(templateBytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    const documentXml = await (await JSZip.loadAsync(result.blob))
      .file('word/document.xml')?.async('text') ?? '';
    const document = new DOMParser().parseFromString(documentXml, 'application/xml');
    const ratingCell = Array.from(document.getElementsByTagNameNS('*', 'tc'))
      .find((cell) => cell.textContent?.trim() === rating && cell.getElementsByTagNameNS('*', 'shd').length > 0);
    expect(ratingCell?.getElementsByTagNameNS('*', 'shd')[0]?.getAttributeNS(
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'fill',
    )).toBe(expectedFill);
  });
});
