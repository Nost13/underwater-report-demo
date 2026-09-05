import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { emptyReportInfo } from '../app/reportInfo';
import { fillSection14Template } from './section14Writer';

const templatePath = 'public/templates/section1_4_template.docx';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const serialize = (element: Element) => new XMLSerializer().serializeToString(element);
const elements = (element: Document | Element, name: string) => Array.from(element.getElementsByTagNameNS('*', name));
const cellAt = (document: Document, table: number, row: number, cell: number) => elements(elements(elements(document, 'tbl')[table], 'tr')[row], 'tc')[cell];
const runProperties = (cell: Element) => elements(cell, 'r').map((run) => elements(run, 'rPr').map(serialize));

async function fixture(jobNo = 'US-CLS-2608007') {
  const bytes = await readFile(templatePath);
  const original = await JSZip.loadAsync(bytes);
  const info = emptyReportInfo();
  info.vessel.jobNo = jobNo;
  info.operation = { ...info.operation, eta: '2026-09-01T01:36', etd: '2026-09-01T18:00', start: '2026-09-01T15:35', end: '2026-09-01T16:24', workWindow: '16 Hours + 1 Hrs', workingTime: '0 Hrs 49 Min' };
  return { original, bytes, info };
}

describe('Section 1–4 template writer', () => {
  it('fills the vessel, operation, service, and readiness cells without changing the footer', async () => {
    const bytes = await readFile(templatePath);
    const original = await JSZip.loadAsync(bytes);
    const footer = await original.file('word/footer1.xml')?.async('uint8array');
    const styles = await original.file('word/styles.xml')?.async('uint8array');
    const reportInfo = emptyReportInfo();
    reportInfo.vessel = { ...reportInfo.vessel, name: 'M.V. TEST', imo: '1234567', callSign: 'TEST1', type: 'Bulk Carrier', loa: '200', breadth: '32', gt: '40,000', dwt: '70,000', yearBuilt: '2020', ownerClient: 'Test Client', jobNo: 'us-test-001' };
    reportInfo.operation = { ...reportInfo.operation, eta: '01 Jan 2027', etd: '02 Jan 2027', workWindow: '24 Hours', location: 'Ulsan', start: '01 Jan 2027, 09:00', end: '01 Jan 2027, 12:00', workingTime: '3 Hrs', position: 'PORT SIDE', draughtFwd: '10.1', draughtMid: '10.2', draughtAft: '10.3', berthingSide: 'PORT', weather: 'Clear', knots: '0.1', current: '0.2', visibility: '1.0', personnel: 'DIVER : 4' };
    reportInfo.serviceItems = ['Inspection', 'Polishing'];
    reportInfo.readiness = { toolboxTime: '06:00 ~ 06:30 Hrs', toolboxNote: 'Toolbox complete.', toolboxPhotos: [null, null], preparationTime: '07:00 ~ 07:30 Hrs', preparationNote: 'Preparation complete.', preparationPhotos: [null, null] };

    const blob = await fillSection14Template({ reportInfo, templateUrl: 'section1_4_template.docx' }, {
      fetchTemplate: async () => Uint8Array.from(bytes),
    });
    const output = await JSZip.loadAsync(blob);
    const originalDocument = new DOMParser().parseFromString(await original.file('word/document.xml')?.async('text') ?? '', 'application/xml');
    const document = new DOMParser().parseFromString(await output.file('word/document.xml')?.async('text') ?? '', 'application/xml');
    const tables = Array.from(document.getElementsByTagNameNS('*', 'tbl'));
    const cells = (table: Element, row: number) => Array.from(table.getElementsByTagNameNS('*', 'tr'))[row]
      ? Array.from(Array.from(table.getElementsByTagNameNS('*', 'tr'))[row].children).filter((node) => node.localName === 'tc')
      : [];
    expect(cells(tables[0], 1).map((cell) => cell.textContent?.trim())).toEqual(['M.V. TEST', '1234567', 'TEST1']);
    expect(cells(tables[0], 5)[1].textContent?.trim()).toBe('us-test-001');
    expect(cells(tables[1], 1).slice(1).map((cell) => cell.textContent?.trim())).toEqual(['01 Jan 2027', '02 Jan 2027', '24 Hours', 'Ulsan']);
    expect(cells(tables[2], 1).map((cell) => cell.textContent?.trim())).toEqual(['Inspection', 'Inspection service', 'Planned']);
    expect(cells(tables[2], 2).map((cell) => cell.textContent?.trim())).toEqual(['Polishing', 'Polishing service', 'Planned']);
    expect(cells(tables[3], 4)[1].textContent?.trim()).toBe('Toolbox complete.');
    expect(await output.file('word/footer1.xml')?.async('uint8array')).toEqual(footer);
    expect(await output.file('word/styles.xml')?.async('uint8array')).toEqual(styles);
    expect(await output.file('word/header2.xml')?.async('text')).toContain('us-test-001');
    expect(await output.file('word/header2.xml')?.async('text')).toContain('M.V. TEST');
    const originalFirstValueRun = Array.from(originalDocument.getElementsByTagNameNS('*', 'tbl'))[0]
      .getElementsByTagNameNS('*', 'tr')[1].getElementsByTagNameNS('*', 'tc')[0]
      .getElementsByTagNameNS('*', 'r')[0];
    const outputFirstValueRun = tables[0].getElementsByTagNameNS('*', 'tr')[1]
      .getElementsByTagNameNS('*', 'tc')[0].getElementsByTagNameNS('*', 'r')[0];
    expect(new XMLSerializer().serializeToString(outputFirstValueRun.querySelector('*|rPr')!))
      .toBe(new XMLSerializer().serializeToString(originalFirstValueRun.querySelector('*|rPr')!));
  });

  it('writes operational dates on two lines in one paragraph and preserves exact web durations and value fonts', async () => {
    const { original, bytes, info } = await fixture();
    const output = await JSZip.loadAsync(await fillSection14Template({ reportInfo: info, templateUrl: '' }, { fetchTemplate: async () => bytes }));
    const before = parse(await original.file('word/document.xml')!.async('text'));
    const after = parse(await output.file('word/document.xml')!.async('text'));
    for (const [row, col, time] of [[1, 1, '01:36'], [1, 2, '18:00'], [3, 1, '15:35'], [3, 2, '16:24']] as const) {
      const cell = cellAt(after, 1, row, col);
      expect(elements(cell, 'p')).toHaveLength(1);
      expect(elements(cell, 'br')).toHaveLength(1);
      expect(elements(cell, 't').map((node) => node.textContent).join('')).toBe(`01 Sep 2026,${time}`);
      const oldProperties = runProperties(cellAt(before, 1, row, col));
      expect(runProperties(cell).slice(0, oldProperties.length)).toEqual(oldProperties);
    }
    expect(cellAt(after, 1, 1, 3).textContent).toBe('16 Hours + 1 Hrs');
    expect(cellAt(after, 1, 3, 3).textContent).toBe('0 Hrs 49 Min');
    expect(cellAt(after, 0, 5, 1).textContent).toBe('US-CLS-2608007');
  });

  it('replaces only the four existing readiness media parts and preserves the rest of the package and geometry', async () => {
    const { original, bytes, info } = await fixture();
    const files = ['toolbox-1', 'toolbox-2', 'preparation-1', 'preparation-2'].map((name) => new File([name], `${name}.jpg`));
    info.readiness.toolboxPhotos = [files[0], files[1]];
    info.readiness.preparationPhotos = [files[2], files[3]];
    const images = files.map((_, index) => new Uint8Array([255, 216, index, 255, 217]));
    const resizePhoto = vi.fn(async (file: File) => images[files.indexOf(file)]);
    const output = await JSZip.loadAsync(await fillSection14Template({ reportInfo: info, templateUrl: '' }, { fetchTemplate: async () => bytes, resizePhoto }));
    const before = parse(await original.file('word/document.xml')!.async('text'));
    const after = parse(await output.file('word/document.xml')!.async('text'));
    const rels = parse(await output.file('word/_rels/document.xml.rels')!.async('text'));
    const changedMedia: string[] = [];
    for (const [index, tableIndex] of [3, 4].entries()) {
      const row = elements(elements(after, 'tbl')[tableIndex], 'tr')[2];
      const drawings = elements(row, 'drawing');
      expect(drawings).toHaveLength(2);
      for (const [slot, drawing] of drawings.entries()) {
        const id = elements(drawing, 'blip')[0].getAttributeNS(R, 'embed');
        const rel = elements(rels, 'Relationship').find((item) => item.getAttribute('Id') === id)!;
        const path = `word/${rel.getAttribute('Target')}`;
        changedMedia.push(path);
        expect(await output.file(path)!.async('uint8array')).toEqual(images[index * 2 + slot]);
        expect(resizePhoto).toHaveBeenNthCalledWith(index * 2 + slot + 1, files[index * 2 + slot], 1200, 900);
      }
    }
    expect(changedMedia).toEqual(['word/media/image1.jpeg', 'word/media/image2.jpeg', 'word/media/image3.jpeg', 'word/media/image4.jpeg']);
    expect(resizePhoto).toHaveBeenCalledTimes(4);
    for (const name of ['tblPr', 'tblGrid', 'trPr', 'tcPr', 'drawing', 'sectPr']) {
      expect(elements(after, name).map(serialize), name).toEqual(elements(before, name).map(serialize));
    }
    for (const name of ['tbl', 'tr', 'tc']) expect(elements(after, name)).toHaveLength(elements(before, name).length);
    // All original value-run properties survive, including the runs moved out of date paragraphs.
    elements(before, 'tc').forEach((cell, index) => {
      const expected = runProperties(cell);
      expect(runProperties(elements(after, 'tc')[index]).slice(0, expected.length)).toEqual(expected);
    });
    const headerBefore = parse(await original.file('word/header2.xml')!.async('text'));
    const headerAfter = parse(await output.file('word/header2.xml')!.async('text'));
    for (const name of ['rPr', 'pPr', 'drawing']) expect(elements(headerAfter, name).map(serialize)).toEqual(elements(headerBefore, name).map(serialize));
    const editable = new Set(['word/document.xml', 'word/header2.xml', ...changedMedia]);
    expect(Object.keys(output.files).sort()).toEqual(Object.keys(original.files).sort());
    for (const path of Object.keys(original.files).filter((path) => !original.files[path].dir && !editable.has(path))) {
      expect(await output.file(path)!.async('uint8array'), path).toEqual(await original.file(path)!.async('uint8array'));
    }
  });

  it('replaces every empty readiness slot with white JPEG bytes so sample photos cannot leak', async () => {
    const { original, bytes, info } = await fixture();
    const resizePhoto = vi.fn();
    const output = await JSZip.loadAsync(await fillSection14Template({ reportInfo: info, templateUrl: '' }, { fetchTemplate: async () => bytes, resizePhoto }));
    const replacements = await Promise.all([1, 2, 3, 4].map(async (index) => {
      const path = `word/media/image${index}.jpeg`;
      const image = await output.file(path)!.async('uint8array');
      expect(image).not.toEqual(await original.file(path)!.async('uint8array'));
      expect(Array.from(image.slice(0, 2))).toEqual([255, 216]);
      // This fixture was decoded independently: 4x3 RGB, every channel 255.
      expect(createHash('sha256').update(image).digest('hex')).toBe('9d514f28b3f4f0906a17af13bc000893bd0ca9fadf50fc7c6a60b5374b74be3f');
      return image;
    }));
    replacements.forEach((image) => expect(image).toEqual(replacements[0]));
    expect(resizePhoto).not.toHaveBeenCalled();
  });

  it('keeps mixed-case operator Job No values unchanged in cells and headers', async () => {
    const { bytes, info } = await fixture('Us-CLS-2608007');
    const output = await JSZip.loadAsync(await fillSection14Template({ reportInfo: info, templateUrl: '' }, { fetchTemplate: async () => bytes }));
    const doc = parse(await output.file('word/document.xml')!.async('text'));
    expect(cellAt(doc, 0, 5, 1).textContent).toBe('Us-CLS-2608007');
    expect(await output.file('word/header2.xml')!.async('text')).toContain('Us-CLS-2608007');
  });

  it('blanks failed readiness photos, reports each failure, and continues successful slots without package drift', async () => {
    const { original, bytes, info } = await fixture();
    const emptyOutput = await JSZip.loadAsync(await fillSection14Template({ reportInfo: info, templateUrl: '' }, { fetchTemplate: async () => bytes }));
    const broken = new File(['bad'], 'unsupported.heic');
    const successful = new File(['photo'], 'preparation.jpg');
    const secondBroken = new File(['bad'], 'corrupt.jpg');
    info.readiness.toolboxPhotos = [broken, successful];
    info.readiness.preparationPhotos = [broken, secondBroken];
    const rendered = new Uint8Array([255, 216, 9, 255, 217]);
    const attempted: string[] = [];
    const skipped: string[] = [];
    const output = await JSZip.loadAsync(await fillSection14Template({ reportInfo: info, templateUrl: '' }, {
      fetchTemplate: async () => bytes,
      resizePhoto: async (file) => {
        attempted.push(file.name);
        if (file !== successful) throw new Error('Unsupported or corrupt image');
        return rendered;
      },
      onPhotoSkipped: (fileName) => skipped.push(fileName),
    }));
    expect(attempted).toEqual(['unsupported.heic', 'preparation.jpg', 'unsupported.heic', 'corrupt.jpg']);
    expect(skipped).toEqual(['unsupported.heic', 'unsupported.heic', 'corrupt.jpg']);
    expect(await output.file('word/media/image2.jpeg')!.async('uint8array')).toEqual(rendered);
    for (const index of [1, 3, 4]) {
      const image = await output.file(`word/media/image${index}.jpeg`)!.async('uint8array');
      expect(createHash('sha256').update(image).digest('hex')).toBe('9d514f28b3f4f0906a17af13bc000893bd0ca9fadf50fc7c6a60b5374b74be3f');
    }
    expect(Object.keys(output.files).sort()).toEqual(Object.keys(original.files).sort());
    // Failure recovery must change only the successful slot relative to the verified all-white output.
    for (const path of Object.keys(emptyOutput.files).filter((path) => !emptyOutput.files[path].dir && path !== 'word/media/image2.jpeg')) {
      expect(await output.file(path)!.async('uint8array'), path).toEqual(await emptyOutput.file(path)!.async('uint8array'));
    }
    const before = parse(await original.file('word/document.xml')!.async('text'));
    const after = parse(await output.file('word/document.xml')!.async('text'));
    for (const name of ['tblPr', 'tblGrid', 'trPr', 'tcPr', 'drawing', 'sectPr']) {
      expect(elements(after, name).map(serialize), name).toEqual(elements(before, name).map(serialize));
    }
  });
});
