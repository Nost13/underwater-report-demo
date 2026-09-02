import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import { fillSummaryTemplate } from './summaryWriter';

const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('bundled Summary template', () => {
  it('fills final Detail values while retaining blank fixed Finding Matrix rows and template styles', async () => {
    const templateBytes = await readFile('public/templates/summary_template.docx');
    const source = await JSZip.loadAsync(templateBytes);
    const sourceStyles = await source.file('word/styles.xml')!.async('uint8array');
    const seaChest = createNicheSections({
      component: 'Sea Chest', type: 'SIDE', quantity: 1, service: 'CLEANING',
    })[0];
    seaChest.conditions.AFTER = {
      fouling: { coverage: 0, slimeOnly: false, type: '' },
      observed: { level: 'Normal / Trace', type: '' },
    };
    const ropeGuard = createNicheSections({
      component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION',
    })[0];
    ropeGuard.conditions.CURRENT = {
      fouling: { coverage: 10, slimeOnly: false, type: '' },
      observed: { level: 'Minor Observation', type: 'Scratch' },
    };
    const finBlade = createNicheSections({
      component: 'Fin Blade', type: 'SINGLE', quantity: 1, service: 'INSPECTION',
    })[0];

    const blob = await fillSummaryTemplate({
      sections: [finBlade, ropeGuard, seaChest],
      templateUrl: 'templates/summary_template.docx',
    }, { fetchTemplate: async () => Uint8Array.from(templateBytes) });

    const output = await JSZip.loadAsync(blob);
    const xml = await output.file('word/document.xml')!.async('text');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const documentText = text(document.documentElement);
    expect(documentText).toContain('5.1 OVERALL RESULT');
    expect(documentText).toContain('5.3 OVERALL FINDINGS MATRIX');
    expect(documentText).not.toContain('MAIN HULL SURFACES / FWD');
    expect(documentText).not.toContain('(CONTINUED)');
    expect(documentText).not.toContain('Fin Blade');
    expect(documentText).not.toMatch(/P\.\d+/);

    const bodyChildren = Array.from(document.getElementsByTagNameNS('*', 'body')[0].children);
    const overallResultIndex = bodyChildren.findIndex((element) => text(element).startsWith('5.1 OVERALL RESULT'));
    const overviewIndex = bodyChildren.findIndex((element) => text(element).startsWith('5.2 BIO'));
    expect(overallResultIndex).toBeGreaterThanOrEqual(0);
    expect(overviewIndex).toBeGreaterThan(overallResultIndex);
    expect(bodyChildren.slice(overallResultIndex + 1, overviewIndex).filter((element) => (
      element.localName === 'p' && !text(element)
    ))).toHaveLength(0);

    const nicheTable = Array.from(document.getElementsByTagNameNS('*', 'tbl'))
      .find((table) => text(table).startsWith('NICHE AREAS & COMPONENTS'))!;
    const dataRows = Array.from(nicheTable.children)
      .filter((child) => child.localName === 'tr')
      .slice(3);
    expect(dataRows.map((row) => Array.from(row.children).filter((cell) => cell.localName === 'tc').map(text))).toEqual([
      ['Bulbous Bow', 'PORT', '', '', '', '', '', '', ''],
      ['', 'STBD', '', '', '', '', '', '', ''],
      ['Bow Thruster', 'PORT', '', '', '', '', '', '', ''],
      ['', 'STBD', '', '', '', '', '', '', ''],
      ['Bilge Keel', 'PORT', '', '', '', '', '', '', ''],
      ['', 'STBD', '', '', '', '', '', '', ''],
      ['Sea Chest', 'PORT', '0', 'Clean / No Fouling', '0%', '1', 'Normal / Trace', '', ''],
      ['', 'STBD', '', '', '', '', '', '', ''],
      ['Discharge Pipe', '', '', '', '', '', '', '', ''],
      ['Anode / ICCP', 'PORT', '', '', '', '', '', '', ''],
      ['', 'STBD', '', '', '', '', '', '', ''],
      ['Transducer', '', '', '', '', '', '', '', ''],
      ['Stern Frame', '', '', '', '', '', '', '', ''],
      ['Rope Guard', '', '3', 'Medium Macro Fouling', '10%', '2', 'Minor Observation', 'Scratch', ''],
      ['Propeller', '', '', '', '', '', '', '', ''],
      ['Boss Cap', '', '', '', '', '', '', '', ''],
      ['Rudder & Pintle', 'PORT', '', '', '', '', '', '', ''],
      ['', 'STBD', '', '', '', '', '', '', ''],
    ]);
    expect(await output.file('word/styles.xml')!.async('uint8array')).toEqual(sourceStyles);
  });
});
