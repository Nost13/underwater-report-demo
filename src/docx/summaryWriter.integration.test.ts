import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import type { ReportSection } from '../domain/types';
import { fillSummaryTemplate } from './summaryWriter';

const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const children = (element: Element, name: string) => Array.from(element.children).filter((child) => child.localName === name);
const nodes = (element: Document | Element, name: string) => Array.from(element.getElementsByTagNameNS('*', name));
const serialize = (element: Node) => new XMLSerializer().serializeToString(element);
const body = (document: Document) => nodes(document, 'body')[0];
const tables = (document: Document) => children(body(document), 'tbl');
const overview = (document: Document) => tables(document).find((table) => text(table).startsWith('ComponentRatingTypeCoverage'))!;
const pageBreaks = (element: Element) => nodes(element, 'br').filter((br) => br.getAttribute('w:type') === 'page');
const leadPage = (document: Document) => {
  const elements = Array.from(body(document).children);
  const end = elements.findIndex((element) => pageBreaks(element).length > 0);
  return elements.slice(0, end < 0 ? -1 : end);
};
async function fill(sections: ReportSection[], transform?: (document: Document) => void) {
  const bytes = await readFile('public/templates/summary_template.docx');
  const source = await JSZip.loadAsync(bytes);
  const sourceDocument = new DOMParser().parseFromString(await source.file('word/document.xml')!.async('text'), 'application/xml');
  if (transform) {
    transform(sourceDocument);
    source.file('word/document.xml', serialize(sourceDocument));
  }
  const blob = await fillSummaryTemplate({ sections, templateUrl: 'unused' }, {
    fetchTemplate: async () => source.generateAsync({ type: 'uint8array' }),
  });
  const output = await JSZip.loadAsync(blob);
  const document = new DOMParser().parseFromString(await output.file('word/document.xml')!.async('text'), 'application/xml');
  return { source, sourceDocument, output, document };
}

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
    // Empty source paragraphs carry the supplied page rhythm and must survive.
    expect(bodyChildren.slice(overallResultIndex + 1, overviewIndex).filter((element) => (
      element.localName === 'p' && !text(element)
    ))).toHaveLength(3);

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

  it('preserves the complete lead-page sequence, legend, twelve components, and package furniture', async () => {
    const sections = [...createGeneralSections('INSPECTION'), ...createNicheSections({
      component: 'Sea Chest', type: 'SIDE', quantity: 1, service: 'CLEANING',
    })];
    const { source, sourceDocument, output, document } = await fill(sections);
    const before = leadPage(sourceDocument);
    const after = leadPage(document);
    expect(after.map((element) => element.localName)).toEqual(before.map((element) => element.localName));
    expect(after).toHaveLength(16);
    for (const [index, element] of before.entries()) {
      if (element.localName === 'p' && !text(element)) expect(serialize(after[index])).toBe(serialize(element));
    }
    expect(text(after[3])).toBe('5.1 OVERALL RESULT');
    expect(text(after[8])).toBe('5.2 BIOFOULING CONDITION OVERVIEW');
    expect(serialize(after[13])).toBe(serialize(before[13])); // The complete rating legend.
    const diagramFurniture = (element: Element) => {
      const clone = element.cloneNode(true) as Element;
      for (const box of nodes(clone, 'txbxContent')) {
        nodes(box, 't').filter((node) => /Rating/.test(text(node))).forEach((node) => { node.textContent = 'Rating'; });
        nodes(box, 'left').forEach((node) => node.removeAttribute('w:color'));
      }
      return serialize(clone);
    };
    expect(diagramFurniture(after[11])).toBe(diagramFurniture(before[11]));
    const sourceRows = children(overview(sourceDocument), 'tr');
    const outputRows = children(overview(document), 'tr');
    expect(outputRows).toHaveLength(7); // Six paired rows, twelve permanent component slots.
    expect(outputRows.map((row) => children(row, 'tc').filter((_, index) => index % 4 === 0).map(text)))
      .toEqual(sourceRows.map((row) => children(row, 'tc').filter((_, index) => index % 4 === 0).map(text)));
    expect(children(outputRows[1], 'tc').slice(1, 4).map(text)).toEqual(['', '', '']);

    // Only rating fills are editable in the original table/cell geometry.
    for (const name of ['tblPr', 'tblGrid', 'trPr', 'tcPr', 'pPr', 'rPr', 'sectPr']) {
      const properties = (doc: Document) => nodes(doc, name).map((property) => {
        const clone = property.cloneNode(true) as Element;
        nodes(clone, 'shd').forEach((node) => node.remove());
        nodes(clone, 'left').forEach((node) => node.removeAttribute('w:color'));
        return serialize(clone);
      });
      expect(properties(document), name).toEqual(properties(sourceDocument));
    }
    for (const name of ['anchor', 'inline', 'pict', 'txbxContent', 'lastRenderedPageBreak']) {
      expect(nodes(document, name).length, name).toBe(nodes(sourceDocument, name).length);
    }
    expect(Object.keys(output.files).sort()).toEqual(Object.keys(source.files).sort());
    for (const [path, part] of Object.entries(source.files)) {
      if (part.dir || ['word/document.xml', 'word/settings.xml'].includes(path)) continue;
      expect(await output.file(path)!.async('uint8array'), path).toEqual(await part.async('uint8array'));
    }
    const settings = (xml: string) => xml.replace(/<w:updateFields\b[^>]*\/>/g, '');
    expect(settings(await output.file('word/settings.xml')!.async('text')))
      .toBe(settings(await source.file('word/settings.xml')!.async('text')));
  });

  it.each(['empty', 'fin-only', 'main', 'niche', 'both'])('keeps only existing conditional pages for %s scope', async (scope) => {
    const general = createGeneralSections('INSPECTION');
    const niche = createNicheSections({ component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION' });
    const fin = createNicheSections({ component: 'Fin Blade', type: 'SINGLE', quantity: 1, service: 'INSPECTION' });
    const sections = scope === 'both' ? [...general, ...niche] : scope === 'main' ? general : scope === 'niche' ? niche : scope === 'fin-only' ? fin : [];
    const { document } = await fill(sections);
    const expectedPages = scope === 'both' ? 4 : scope === 'main' ? 3 : scope === 'niche' ? 2 : 1;
    expect(pageBreaks(body(document))).toHaveLength(expectedPages - 1);
    expect(text(document.documentElement).includes('MAIN HULL SURFACES / FWD')).toBe(['both', 'main'].includes(scope));
    expect(text(document.documentElement).includes('NICHE AREAS & COMPONENTS')).toBe(['both', 'niche'].includes(scope));
    expect(children(overview(document), 'tr')).toHaveLength(7);
    expect(text(document.documentElement)).not.toContain('Fin Blade');
  });

  it('removes explicit break-only blank artifacts while retaining original spacers and rendered break markers', async () => {
    const { document, sourceDocument } = await fill(createGeneralSections('INSPECTION'), (doc) => {
      const firstBreak = Array.from(body(doc).children).find((element) => pageBreaks(element).length)!;
      body(doc).insertBefore(firstBreak.cloneNode(true), firstBreak.nextSibling);
    });
    expect(pageBreaks(body(document))).toHaveLength(2);
    expect(leadPage(document).map((element) => element.localName)).toEqual(leadPage(sourceDocument).map((element) => element.localName));
  });

  it('propagates edited final coverage into the fixed overview and condition cells', async () => {
    const section = createNicheSections({ component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const expected = [
      { coverage: 0 as const, cells: ['0', 'Clean / No Fouling', '0%'] },
      { coverage: 60 as const, cells: ['5', 'Severe Macro Fouling', '60%'] },
    ];
    for (const example of expected) {
      section.conditions.AFTER!.fouling.coverage = example.coverage;
      const { document } = await fill([section]);
      const row = children(overview(document), 'tr').find((candidate) => children(candidate, 'tc').some((cell) => text(cell) === 'Rope Guard'))!;
      const cells = children(row, 'tc');
      const offset = cells.findIndex((cell) => text(cell) === 'Rope Guard');
      expect(cells.slice(offset + 1, offset + 4).map(text)).toEqual(example.cells);
      const nicheTable = tables(document).find((table) => text(table).startsWith('NICHE AREAS & COMPONENTS'))!;
      const detail = children(nicheTable, 'tr').find((candidate) => text(children(candidate, 'tc')[0]) === 'Rope Guard')!;
      expect(children(detail, 'tc').slice(2, 5).map(text)).toEqual(example.cells);
    }
  });

  it('uses the empty destination slot font when adding observed-condition text', async () => {
    const section = createGeneralSections('INSPECTION').find((item) => item.component === 'FWD' && item.side === 'PORT')!;
    section.conditions.CURRENT!.observed = { level: 'Minor Observation', type: 'Scratch' };
    const { document, sourceDocument } = await fill([section]);
    const typeCell = (doc: Document) => children(children(tables(doc).find((table) => text(table).startsWith('MAIN HULL SURFACES / FWD'))!, 'tr')[3], 'tc')[7];
    const sourceCell = typeCell(sourceDocument);
    const outputCell = typeCell(document);
    expect(nodes(sourceCell, 't')).toHaveLength(0);
    expect(text(outputCell)).toBe('Scratch');
    expect(serialize(nodes(nodes(outputCell, 'r')[0], 'rPr')[0]))
      .toBe(serialize(nodes(nodes(sourceCell, 'pPr')[0], 'rPr')[0]));
    expect(serialize(nodes(outputCell, 'pPr')[0])).toBe(serialize(nodes(sourceCell, 'pPr')[0]));
  });
});
