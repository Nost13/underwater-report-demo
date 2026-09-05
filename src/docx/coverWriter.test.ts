import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createCoverInfo, type CoverInfo } from '../app/coverInfo';
import { emptyReportInfo } from '../app/reportInfo';
import type { ReportSection } from '../domain/types';
import { fillCoverTemplate } from './coverWriter';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const elements = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
const text = (node: Element) => elements(node, 't').map((t) => t.textContent).join('');
const paragraph = (doc: Document, id: string) => elements(doc, 'p').filter((p) => p.getAttribute('w14:paraId') === id);
const editableIds = ['24C58190', '7E63896D', '75F45E71', '268CAB18', '7D8C7621', '2C8FCF0C', '118116C9', '7DCE8FF3', '153C7F6D', '769FEDD6'];
const maskEditableText = (xml: string) => editableIds.reduce((value, id) => value.replace(new RegExp(`<w:p\\b[^>]*w14:paraId="${id}"[^>]*>[\\s\\S]*?</w:p>`, 'g'), (p) => p.replace(/<w:br\/>/g, '').replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g, '')), xml);
const hero = (xml: string) => xml.match(/<wp:anchor\b[^>]*>[\s\S]*?<\/wp:anchor>/g)!.find((anchor) => anchor.includes('r:embed="rId13"'));

async function fixture() {
  const bytes = await readFile('public/templates/cover.docx');
  const original = await JSZip.loadAsync(bytes);
  const reportInfo = emptyReportInfo();
  Object.assign(reportInfo.vessel, { jobNo: 'US-CLS-2608007', name: 'MSC JAVELIN IX', imo: '1234567', callSign: 'AbC9', ownerClient: 'Ocean & Sons <Korea>' });
  Object.assign(reportInfo.operation, { start: '2026-09-01T15:35', eta: '2026-08-31T01:36', location: 'Busan Pier 2' });
  const coverInfo: CoverInfo = { ...createCoverInfo(new Date(2026, 8, 5)), scopeMode: 'MANUAL', scopeTitle: 'Rope removal', scopeDescription: 'Remove rope & inspect <Sea Chest>.' };
  const input = { coverInfo, reportInfo, sections: [] as ReportSection[], templateUrl: '/templates/cover.docx' };
  return { bytes, original, input };
}

describe('supplied cover template writer', () => {
  it('retains the byte-for-byte runtime copy fingerprint recorded from the source', async () => {
    const { bytes } = await fixture();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('5ca78fc461eacde3f24f3ddc95f2a2c2d6deeb37dd3a216a64acc01915a49355');
  });

  it('fills every structural slot, including both grouped-header representations, without changing case or formatting', async () => {
    const { bytes, original, input } = await fixture();
    const zip = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes }));
    const xml = await zip.file('word/document.xml')!.async('text');
    const doc = parse(xml);
    expect(elements(doc, 'parsererror')).toHaveLength(0);
    const expected: Record<string, string[]> = {
      '24C58190': ['REPORT NO : US-CLS-2608007', 'REPORT NO : US-CLS-2608007'],
      '7E63896D': ['DATE OF ISSUE : 5 Sep 2026', 'DATE OF ISSUE : 5 Sep 2026'],
      '75F45E71': ['MSC JAVELIN IX'], '268CAB18': ['1234567'], '7D8C7621': ['AbC9'],
      '2C8FCF0C': ['Ocean & Sons <Korea>'], '118116C9': ['1 Sep 2026 ,'], '7DCE8FF3': ['Busan Pier 2'],
      '153C7F6D': ['Rope removal'], '769FEDD6': ['Remove rope & inspect <Sea Chest>.'],
    };
    for (const [id, values] of Object.entries(expected)) expect(paragraph(doc, id).map(text), id).toEqual(values);
    const sourceXml = await original.file('word/document.xml')!.async('text');
    expect(maskEditableText(xml)).toBe(maskEditableText(sourceXml));
    expect(hero(xml)).toBe(hero(sourceXml));
    expect(elements(doc, 'body')).toHaveLength(1);
    expect(elements(doc, 'sectPr')).toHaveLength(1);
    expect(elements(doc, 'tbl')).toHaveLength(2);
    expect(xml).not.toContain('MSC BEIJING');
  });

  it('preserves every noneditable package part and every relationship byte-for-byte', async () => {
    const { bytes, original, input } = await fixture();
    const zip = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes }));
    expect(Object.keys(zip.files).sort()).toEqual(Object.keys(original.files).sort());
    for (const path of Object.keys(original.files)) {
      if (['word/document.xml', 'word/media/image3.jpeg', '[Content_Types].xml'].includes(path)) continue;
      expect(await zip.file(path)!.async('uint8array'), path).toEqual(await original.file(path)!.async('uint8array'));
    }
    const types = parse(await zip.file('[Content_Types].xml')!.async('text'));
    expect(elements(types, 'Override').find((node) => node.getAttribute('PartName') === '/word/media/image3.jpeg')?.getAttribute('ContentType')).toBe('image/png');
  });

  it('replaces only the largest floating picture with renderer bytes and forwards the saved crop', async () => {
    const { bytes, input } = await fixture();
    const rendered = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 99]);
    input.coverInfo.photoFile = new File(['photo'], 'cover.png', { type: 'image/png' });
    input.coverInfo.crop = { focusX: 0.3, focusY: 0.7, zoom: 1.8 };
    const renderPhoto = vi.fn(async () => rendered);
    const zip = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes, renderPhoto }));
    expect(await zip.file('word/media/image3.jpeg')!.async('uint8array')).toEqual(rendered);
    expect(renderPhoto).toHaveBeenCalledWith(input.coverInfo.photoFile, input.coverInfo.crop, { width: 3026, height: 1551, cropInsets: { top: .15821, bottom: .15821 } });
  });

  it('uses an opaque white PNG when the photo is missing, without browser image APIs or the source sample', async () => {
    const { bytes, original, input } = await fixture();
    const renderPhoto = vi.fn();
    const zip = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes, renderPhoto }));
    const image = Buffer.from(await zip.file('word/media/image3.jpeg')!.async('uint8array'));
    expect(image.equals(Buffer.from(await original.file('word/media/image3.jpeg')!.async('uint8array')))).toBe(false);
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const chunks: Buffer[] = [];
    for (let offset = 8; offset < image.length;) {
      const length = image.readUInt32BE(offset);
      if (image.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(image.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    expect(inflateSync(Buffer.concat(chunks))).toEqual(Buffer.from([0, 255, 255, 255]));
    expect(renderPhoto).not.toHaveBeenCalled();
  });

  it('white-replaces an unreadable photo and reports it through the skipped-image callback', async () => {
    const { bytes, input } = await fixture();
    input.coverInfo.photoFile = new File(['bad image'], 'broken.heic');
    const skipped: string[] = [];
    const zip = await JSZip.loadAsync(await fillCoverTemplate(input, {
      fetchTemplate: async () => bytes,
      renderPhoto: async () => { throw new Error('IMAGE_DECODE_FAILED'); },
      onPhotoSkipped: (name) => skipped.push(name),
    }));
    expect(skipped).toEqual(['broken.heic']);
    const blankInput = { ...input, coverInfo: { ...input.coverInfo, photoFile: null } };
    const blank = await JSZip.loadAsync(await fillCoverTemplate(blankInput, { fetchTemplate: async () => bytes }));
    expect(await zip.file('word/media/image3.jpeg')!.async('uint8array')).toEqual(await blank.file('word/media/image3.jpeg')!.async('uint8array'));
  });

  it('regenerates automatic scope but preserves manual text and native line breaks in the existing runs', async () => {
    const { bytes, original, input } = await fixture();
    input.sections = [{ id: 'one', area: 'NICHE', component: 'SEA CHEST', service: 'REMOVAL', phases: [] }] as unknown as ReportSection[];
    input.coverInfo.scopeMode = 'AUTO';
    const auto = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes }));
    const autoDoc = parse(await auto.file('word/document.xml')!.async('text'));
    expect(text(paragraph(autoDoc, '153C7F6D')[0])).toBe('Removal of SEA CHEST');
    expect(text(paragraph(autoDoc, '769FEDD6')[0])).toBe('Removal: SEA CHEST');
    input.coverInfo.scopeMode = 'MANUAL';
    input.coverInfo.scopeDescription = 'First line\nSecond line';
    const manual = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes }));
    const xml = await manual.file('word/document.xml')!.async('text');
    const p = paragraph(parse(xml), '769FEDD6')[0];
    expect(elements(p, 'br')).toHaveLength(1);
    expect(elements(p, 't').map((t) => t.textContent).join('')).toBe('First lineSecond line');
    expect(maskEditableText(xml)).toBe(maskEditableText(await original.file('word/document.xml')!.async('text')));
  });

  it('blanks missing linked values and invalid issue dates and uses ETA when Start is absent', async () => {
    const { bytes, input } = await fixture();
    input.reportInfo = emptyReportInfo();
    input.coverInfo.issueDate = '2026-02-31';
    const output = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes }));
    const doc = parse(await output.file('word/document.xml')!.async('text'));
    for (const id of ['75F45E71', '268CAB18', '7D8C7621', '2C8FCF0C', '118116C9', '7DCE8FF3']) expect(paragraph(doc, id).map(text)).toEqual(['']);
    expect(paragraph(doc, '7E63896D').map(text)).toEqual(['DATE OF ISSUE : ', 'DATE OF ISSUE : ']);
    input.reportInfo.operation.eta = '2026-08-31T01:36';
    const fallback = await JSZip.loadAsync(await fillCoverTemplate(input, { fetchTemplate: async () => bytes }));
    expect(text(paragraph(parse(await fallback.file('word/document.xml')!.async('text')), '118116C9')[0])).toBe('31 Aug 2026');
  });

  it('reports fetch failures and refuses a template with a missing approved slot', async () => {
    const { original, input } = await fixture();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    try { await expect(fillCoverTemplate(input)).rejects.toThrow('COVER_TEMPLATE_FETCH_FAILED:404'); } finally { vi.unstubAllGlobals(); }
    original.file('word/document.xml', (await original.file('word/document.xml')!.async('text')).replace('w14:paraId="75F45E71"', 'w14:paraId="changed"'));
    await expect(fillCoverTemplate(input, { fetchTemplate: async () => original.generateAsync({ type: 'uint8array' }) })).rejects.toThrow('COVER_SLOT_NOT_FOUND:75F45E71');
  });
});
