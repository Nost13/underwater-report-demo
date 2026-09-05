import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { emptyReportInfo } from '../app/reportInfo';
import { fillSection14Template } from './section14Writer';

const templatePath = 'public/templates/section1_4_template.docx';

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
    expect(cells(tables[0], 5)[1].textContent?.trim()).toBe('US-TEST-001');
    expect(cells(tables[1], 1).slice(1).map((cell) => cell.textContent?.trim())).toEqual(['01 Jan 2027', '02 Jan 2027', '24 Hours', 'Ulsan']);
    expect(cells(tables[2], 1).map((cell) => cell.textContent?.trim())).toEqual(['Inspection', 'Inspection service', 'Planned']);
    expect(cells(tables[2], 2).map((cell) => cell.textContent?.trim())).toEqual(['Polishing', 'Polishing service', 'Planned']);
    expect(cells(tables[3], 4)[1].textContent?.trim()).toBe('Toolbox complete.');
    expect(await output.file('word/footer1.xml')?.async('uint8array')).toEqual(footer);
    expect(await output.file('word/styles.xml')?.async('uint8array')).toEqual(styles);
    expect(await output.file('word/header2.xml')?.async('text')).toContain('US-TEST-001');
    expect(await output.file('word/header2.xml')?.async('text')).toContain('M.V. TEST');
    const originalFirstValueRun = Array.from(originalDocument.getElementsByTagNameNS('*', 'tbl'))[0]
      .getElementsByTagNameNS('*', 'tr')[1].getElementsByTagNameNS('*', 'tc')[0]
      .getElementsByTagNameNS('*', 'r')[0];
    const outputFirstValueRun = tables[0].getElementsByTagNameNS('*', 'tr')[1]
      .getElementsByTagNameNS('*', 'tc')[0].getElementsByTagNameNS('*', 'r')[0];
    expect(new XMLSerializer().serializeToString(outputFirstValueRun.querySelector('*|rPr')!))
      .toBe(new XMLSerializer().serializeToString(originalFirstValueRun.querySelector('*|rPr')!));
  });
});
