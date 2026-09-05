import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
import { emptyReportInfo } from '../app/reportInfo';
import type { VesselDiagramConfig } from '../vesselDiagram/types';
import { composeVesselDiagram, type CanvasContext } from '../vesselDiagram/composer';
import { writeTemplateReport } from './templateWriter';
import { createCoverInfo } from '../app/coverInfo';
import { posix } from 'node:path';
import { createHash } from 'node:crypto';

const templatePath = 'public/templates/Detail_report_template.docx';

const configuredMarkerIds = [
  'hull-fwd', 'hull-fwd-mid', 'hull-mid', 'hull-mid-aft', 'hull-aft',
  'propeller-group', 'aft-services', 'rudder-group', 'fwd-services', 'bulbous-bow',
  'transducer-aft', 'transducer-fwd', 'anode-aft', 'anode-fwd', 'bilge-keel-1', 'bilge-keel-2',
];

const vesselDiagram = (): VesselDiagramConfig => ({
  imageFile: new File(['vessel'], 'vessel.png', { type: 'image/png' }),
  imageName: 'vessel.png',
  calibration: { sternX: .08, bowX: .92, hullTopY: .15, bottomY: .86 },
  confirmed: true,
  hullMarkers: configuredMarkerIds.slice(0, 5).map((id) => ({
    id, groupId: 'hull' as const, shape: 'RECTANGLE' as const, rect: { x: .1, y: .1, width: .1, height: .1 },
  })),
  nicheMarkers: configuredMarkerIds.slice(5).map((id) => ({
    id, groupId: 'propeller-group' as const, shape: 'ELLIPSE' as const, rect: { x: .1, y: .1, width: .1, height: .1 },
  })),
});

const composeDiagram = async (_config: VesselDiagramConfig, ids: string[]) => new TextEncoder().encode(ids.join(','));

describe('bundled Detail report template', () => {
  it('keeps first drawing IDs and assigns unused IDs only to later duplicates in a complete multi-component report', async () => {
    const names = ['cover', 'section1_4_template', 'summary_template', 'section6_template', 'Detail_report_template', 'section8_template'];
    const bytes = await Promise.all(names.map((name) => readFile(`public/templates/${name}.docx`)));
    const sections = ['Rope Guard', 'Transducer'].map((component) => createNicheSections({ component, type: 'SINGLE', quantity: 1, service: 'INSPECTION' })[0]);
    const photos: PhotoData[] = sections.map((section, index) => ({ id: `drawing-${index}`, sectionId: section.id, phase: 'CURRENT', reportUse: true, order: 1, relativePath: `${index}.jpg`, file: new File(['photo'], `${index}.jpg`), captionText: '' }));
    const inputs = {
      vesselName: 'MULTI COMPONENT', sections, photos, vesselDiagram: vesselDiagram(), reportInfo: emptyReportInfo(), coverInfo: createCoverInfo(),
      coverTemplateUrl: names[0], section14TemplateUrl: names[1], summaryTemplateUrl: names[2], section6TemplateUrl: names[3], templateUrl: names[4], section8TemplateUrl: names[5],
    };
    const dependencies = {
      fetchCoverTemplate: async () => bytes[0], fetchSection14Template: async () => bytes[1], fetchSummaryTemplate: async () => bytes[2],
      fetchSection6Template: async () => bytes[3], fetchTemplate: async () => bytes[4], fetchSection8Template: async () => bytes[5],
      resize: async () => new Uint8Array([255, 216, 255, 217]), composeDiagram,
    };
    const single = await writeTemplateReport({ ...inputs, sections: [sections[0]], photos: [photos[0]] }, dependencies);
    const multi = await writeTemplateReport(inputs, dependencies);
    const rerun = await writeTemplateReport(inputs, dependencies);
    const xml = async (blob: Blob) => (await JSZip.loadAsync(blob)).file('word/document.xml')!.async('text');
    const singleXml = await xml(single.blob);
    const multiXml = await xml(multi.blob);
    expect(multi.pageCount).toBe(2);
    const drawings = (text: string) => Array.from(new DOMParser().parseFromString(text, 'application/xml').getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'docPr'));
    const multiDrawings = drawings(multiXml);
    const ids = multiDrawings.map((node) => node.getAttribute('id')!);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^\d+$/.test(id) && Number(id) > 0)).toBe(true);
    // Every unique original from the complete single-component document remains
    // at its first occurrence, including the cover, readiness and Summary art.
    const originalNodes = drawings(singleXml);
    for (const original of originalNodes) {
      const first = multiDrawings.find((node) => node.getAttribute('id') === original.getAttribute('id'))!;
      expect(first?.outerHTML, original.getAttribute('name') ?? '').toBe(original.outerHTML);
    }
    const profiles = multiDrawings.filter((node) => node.getAttribute('descr') === 'vessel_profile');
    expect(profiles).toHaveLength(2);
    const sourceDetail = await JSZip.loadAsync(bytes[4]);
    const sourceProfile = drawings(await sourceDetail.file('word/document.xml')!.async('text')).find((node) => node.getAttribute('descr') === 'vessel_profile')!;
    expect(profiles[0].getAttribute('id')).toBe(sourceProfile.getAttribute('id'));
    const sourceCover = await JSZip.loadAsync(bytes[0]);
    const originalCoverIds = drawings(await sourceCover.file('word/document.xml')!.async('text')).map((node) => node.getAttribute('id'));
    expect(ids.slice(0, originalCoverIds.length)).toEqual(originalCoverIds);
    expect(profiles[1].getAttribute('id')).not.toBe(profiles[0].getAttribute('id'));
    const secondPhoto = multiDrawings.find((node) => node.getAttribute('name') === 'Report photo 2')!;
    expect(secondPhoto.getAttribute('id')).toBe('2'); // Reserve later unique original IDs before assigning duplicates.
    const originalIds = new Set([...originalNodes.map((node) => node.getAttribute('id')), '2']);
    expect(originalIds.has(profiles[1].getAttribute('id'))).toBe(false);
    const profileDrawing = (node: Element) => node.parentElement!.outerHTML.replace(/(<wp:docPr\b[^>]*\bid=")[^"]+"/, '$1ID"').replace(/rIdVesselDiagram\d+/g, 'rIdVesselDiagram');
    expect(profileDrawing(profiles[1])).toBe(profileDrawing(profiles[0]));
    expect(await xml(rerun.blob)).toBe(multiXml);
  }, 15000);
  it.each(['filled', 'missing', 'unreadable'] as const)('prepends exactly one intact %s cover and keeps the report package authoritative', async (mode) => {
    const names = ['cover', 'section1_4_template', 'summary_template', 'section6_template', 'Detail_report_template', 'section8_template'];
    const bytes = await Promise.all(names.map((name) => readFile(`public/templates/${name}.docx`)));
    const sourceCover = await JSZip.loadAsync(bytes[0]);
    const sourceBase = await JSZip.loadAsync(bytes[1]);
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    const elements = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
    const relationNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const reportInfo = emptyReportInfo();
    Object.assign(reportInfo.vessel, { jobNo: 'US-CLS-2608007', name: 'MSC JAVELIN IX', imo: '1234567', callSign: 'CALL', ownerClient: 'OWNER' });
    const coverInfo = createCoverInfo();
    coverInfo.photoFile = mode === 'missing' ? null : new File(['cover'], 'cover-broken.jpg');
    const section = createNicheSections({ component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION' })[0];
    const broken = new File(['bad'], 'same-broken.jpg');
    if (mode === 'unreadable') reportInfo.readiness.toolboxPhotos = [broken, broken];
    const photo: PhotoData = { id: 'ASSEMBLY', sectionId: section.id, phase: 'CURRENT', reportUse: true, order: 1, relativePath: 'detail.jpg', file: broken, captionText: '' };
    const png = mode === 'filled'
      ? await sourceCover.file('word/media/image1.png')!.async('uint8array')
      : Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
    let downloadedName = '';
    const result = await writeTemplateReport({
      vesselName: reportInfo.vessel.name, sections: [section], photos: [photo], vesselDiagram: vesselDiagram(), reportInfo, coverInfo,
      coverTemplateUrl: names[0], section14TemplateUrl: names[1], summaryTemplateUrl: names[2],
      section6TemplateUrl: names[3], templateUrl: names[4], section8TemplateUrl: names[5],
    }, {
      fetchCoverTemplate: async () => bytes[0], fetchSection14Template: async () => bytes[1], fetchSummaryTemplate: async () => bytes[2],
      fetchSection6Template: async () => bytes[3], fetchTemplate: async () => bytes[4], fetchSection8Template: async () => bytes[5],
      renderCoverPhoto: async () => { if (mode === 'unreadable') throw new Error('decode'); return png; },
      resize: async () => { if (mode === 'unreadable') throw new Error('decode'); return png; },
      resizeReadinessPhoto: async () => { throw new Error('decode'); }, composeDiagram,
      download: (_blob, name) => { downloadedName = name; },
    });
    expect(result.skipped).toEqual(mode === 'unreadable' ? ['same-broken.jpg', 'cover-broken.jpg'] : []);
    expect(downloadedName).toBe('US-CLS-2608007_MSC JAVELIN IX_Underwater service report(Detail).docx');
    const output = await JSZip.loadAsync(result.blob);
    const doc = parse(await output.file('word/document.xml')!.async('text'));
    expect(elements(doc, 'parsererror')).toHaveLength(0);
    const body = elements(doc, 'body')[0];
    const text = body.textContent!.replace(/UNDERWATER[\sㅤ]*PHOTO REPORT/g, 'UNDERWATER PHOTO REPORT');
    expect(text.match(/UNDERWATER PHOTO REPORT/g)).toHaveLength(1);
    const headings = ['UNDERWATER PHOTO REPORT', '1. GENERAL INFORMATION', '2. OPERATIONAL INFORMATION', '3. SERVICE ITEMS', '4. PRE-OPERATION SAFETY & READINESS RECORD', '5.1 OVERALL RESULT', '6. ASSESSMENT GUIDELINES', '7. DETAILED SERVICE RECORD', '8. QUALIFICATION & CERTIFICATION RECORDS'];
    for (const heading of headings) expect(text).toContain(heading);
    const ordered = [text.indexOf(headings[0]), ...headings.slice(1).map((heading) => text.lastIndexOf(heading))];
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    expect(ordered.every((index) => index >= 0)).toBe(true);
    expect(text).not.toContain('MSC BEIJING VIII');
    const sectionProperties = elements(doc, 'sectPr');
    expect(sectionProperties).toHaveLength(2); // Cover's empty header and copyright differ from the report.
    expect(sectionProperties[0].parentElement?.localName).toBe('pPr');
    expect(sectionProperties[0].parentElement?.parentElement?.parentElement).toBe(body);
    expect(elements(sectionProperties[0], 'type')[0]?.getAttribute('w:val')).toBe('nextPage');
    expect(sectionProperties[1].parentElement).toBe(body);
    for (const section of sectionProperties) expect(elements(section, 'pgSz')[0]?.getAttribute('w:w')).toBe('11910');
    const rels = elements(parse(await output.file('word/_rels/document.xml.rels')!.async('text')), 'Relationship');
    const relById = new Map(rels.map((r) => [r.getAttribute('Id'), r]));
    expect(relById.size).toBe(rels.length);
    const resolve = (id: string) => {
      const target = relById.get(id)!.getAttribute('Target')!;
      return target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join('word', target));
    };
    const original = parse(await sourceCover.file('word/document.xml')!.async('text'));
    const coverAnchors = elements(original, 'anchor');
    const outputAnchors = elements(doc, 'anchor').slice(0, coverAnchors.length);
    expect(outputAnchors).toHaveLength(coverAnchors.length);
    for (const [index, anchor] of coverAnchors.entries()) {
      for (const name of ['positionH', 'positionV', 'extent', 'srcRect']) {
        expect(elements(outputAnchors[index], name).map((e) => e.outerHTML)).toEqual(elements(anchor, name).map((e) => e.outerHTML));
      }
    }
    expect(elements(doc, 'imagedata').length).toBeGreaterThanOrEqual(elements(original, 'imagedata').length);
    const hero = outputAnchors.find((a) => elements(a, 'extent')[0]?.getAttribute('cx') === '7686040')!;
    const heroPath = resolve(elements(hero, 'blip')[0].getAttributeNS(relationNS, 'embed')!);
    expect(heroPath).toMatch(/\.jpeg$/);
    expect(await output.file(heroPath)!.async('uint8array')).toEqual(png);
    expect(await output.file(heroPath)!.async('uint8array')).not.toEqual(await sourceCover.file('word/media/image3.jpeg')!.async('uint8array'));
    const types = elements(parse(await output.file('[Content_Types].xml')!.async('text')), 'Override');
    expect(types.find((t) => t.getAttribute('PartName') === `/${heroPath}`)?.getAttribute('ContentType')).toBe('image/png');
    // Every original non-hero cover image, including VML fallback, survives byte-for-byte.
    const hash = async (entry: JSZip.JSZipObject) => createHash('sha256').update(await entry.async('uint8array')).digest('hex');
    const candidates = await Promise.all(Object.values(output.files).filter((f) => f.name.startsWith('word/media/') && !f.dir).map(hash));
    expect(candidates).not.toContain(await hash(sourceCover.file('word/media/image3.jpeg')!));
    for (const entry of Object.values(sourceCover.files).filter((f) => f.name.startsWith('word/media/') && !f.dir && f.name !== 'word/media/image3.jpeg')) expect(candidates, entry.name).toContain(await hash(entry));
    expect(await output.file('word/styles.xml')!.async('text')).toBe(await sourceBase.file('word/styles.xml')!.async('text'));
    const reportHeader = await output.file('word/header2.xml')!.async('text');
    expect(reportHeader).toContain('MSC JAVELIN IX');
    const coverHeaderId = elements(sectionProperties[0], 'headerReference').find((e) => e.getAttribute('w:type') === 'default')!.getAttributeNS(relationNS, 'id')!;
    expect(await output.file(resolve(coverHeaderId))!.async('text')).toBe(await sourceCover.file('word/header2.xml')!.async('text'));
    // Package audit: well-formed XML, resolved internal parts, and every body relationship reference.
    for (const entry of Object.values(output.files).filter((f) => !f.dir && /\.(xml|rels)$/.test(f.name))) {
      const parsed = parse(await entry.async('text'));
      expect(elements(parsed, 'parsererror'), entry.name).toHaveLength(0);
      if (entry.name.endsWith('.rels')) {
        const owner = entry.name === '_rels/.rels' ? '' : entry.name.replace('/_rels/', '/').replace(/\.rels$/, '');
        for (const relation of elements(parsed, 'Relationship')) {
          if (relation.getAttribute('TargetMode') === 'External') continue;
          const target = relation.getAttribute('Target')!;
          const path = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(owner), target));
          expect(output.file(path), `${entry.name}: ${target}`).not.toBeNull();
        }
      }
    }
    for (const element of Array.from(doc.getElementsByTagName('*'))) for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI === relationNS || attribute.name === 'o:relid') expect(relById.has(attribute.value), attribute.name).toBe(true);
    }
  }, 30000);

  it('remaps aliased DrawingML, VML and external links and recursively imports dependent parts', async () => {
    const [coverBytes, baseBytes, detailBytes] = await Promise.all([
      readFile('public/templates/cover.docx'), readFile('public/templates/section1_4_template.docx'), readFile(templatePath),
    ]);
    const source = await JSZip.loadAsync(coverBytes);
    const relNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const pkgNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
    source.file('word/document.xml', (await source.file('word/document.xml')!.async('text')).replace('<w:body>', `<w:body><w:p><w:r><w:pict><v:shape><v:imagedata xmlns:rel="${relNS}" rel:id="rId12" o:relid="rId12"/></v:shape></w:pict></w:r><w:hyperlink r:id="extraLink"><w:r><w:t>LINK</w:t></w:r></w:hyperlink><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:link="extraLink"/></w:drawing></w:r></w:p>`));
    source.file('word/_rels/document.xml.rels', (await source.file('word/_rels/document.xml.rels')!.async('text')).replace('</Relationships>', `<Relationship Id="extraLink" Type="${relNS}/hyperlink" Target="https://example.com/report?a=1&amp;b=2" TargetMode="External"/></Relationships>`));
    source.file('word/_rels/header2.xml.rels', `<Relationships xmlns="${pkgNS}"><Relationship Id="nested" Type="${relNS}/image" Target="../customXml/dependent.xml"/></Relationships>`);
    source.file('customXml/dependent.xml', '<asset>dependent content</asset>');
    source.file('customXml/_rels/dependent.xml.rels', `<Relationships xmlns="${pkgNS}"><Relationship Id="picture" Type="${relNS}/image" Target="../word/media/image1.png"/></Relationships>`);
    const section = createNicheSections({ component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION' })[0];
    const result = await writeTemplateReport({
      vesselName: 'VESSEL', sections: [section], photos: [{ id: 'p', sectionId: section.id, phase: 'CURRENT', reportUse: true, order: 1, relativePath: 'p.jpg', file: new File(['p'], 'p.jpg'), captionText: '' }],
      vesselDiagram: vesselDiagram(), reportInfo: emptyReportInfo(), coverInfo: { ...createCoverInfo(), photoFile: new File(['bad'], 'p.jpg') },
      coverTemplateUrl: 'cover', section14TemplateUrl: 'base', templateUrl: 'detail',
    }, { fetchCoverTemplate: () => source.generateAsync({ type: 'uint8array' }), fetchSection14Template: async () => baseBytes, fetchTemplate: async () => detailBytes, resize: async () => { throw new Error('decode'); }, renderCoverPhoto: async () => { throw new Error('decode'); }, composeDiagram });
    expect(result.skipped).toEqual(['p.jpg']);
    const output = await JSZip.loadAsync(result.blob);
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    const doc = parse(await output.file('word/document.xml')!.async('text'));
    const fallback = Array.from(doc.getElementsByTagNameNS('*', 'imagedata')).find((e) => e.hasAttribute('rel:id'))!;
    expect(fallback.getAttribute('rel:id')).not.toBe('rId12');
    expect(fallback.getAttribute('o:relid')).toBe(fallback.getAttribute('rel:id'));
    const rels = Array.from(parse(await output.file('word/_rels/document.xml.rels')!.async('text')).getElementsByTagNameNS('*', 'Relationship'));
    const linkId = doc.getElementsByTagNameNS('*', 'hyperlink')[0].getAttributeNS(relNS, 'id');
    expect(rels.find((r) => r.getAttribute('Id') === linkId)?.getAttribute('Target')).toBe('https://example.com/report?a=1&b=2');
    expect(Array.from(doc.getElementsByTagNameNS('*', 'blip')).find((e) => e.hasAttribute('r:link'))?.getAttribute('r:link')).toBe(linkId);
    expect(await output.file('customXml/cover-dependent.xml')!.async('text')).toBe('<asset>dependent content</asset>');
    const nested = parse(await output.file('word/_rels/cover-header2.xml.rels')!.async('text')).getElementsByTagNameNS('*', 'Relationship')[0];
    expect(nested.getAttribute('Target')).toBe('/customXml/cover-dependent.xml');
    const picture = parse(await output.file('customXml/_rels/cover-dependent.xml.rels')!.async('text')).getElementsByTagNameNS('*', 'Relationship')[0];
    expect(await output.file(picture.getAttribute('Target')!.slice(1))!.async('uint8array')).toEqual(await source.file('word/media/image1.png')!.async('uint8array'));
  });
  it('preserves source fonts, package parts and fixed geometry while composing raised work and caption runs', async () => {
    const templateBytes = await readFile(templatePath);
    const baseline = await JSZip.loadAsync(templateBytes);
    const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
    const source = parse(await baseline.file('word/document.xml')!.async('text'));
    const elements = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
    const serialize = (node: Node) => new XMLSerializer().serializeToString(node);
    const paragraph = (root: Document, text: string) => elements(root, 'p').find((p) => p.textContent?.includes(text))!;
    const workSource = paragraph(source, '{{WORK}}');
    const labelRPr = elements(elements(workSource, 'r')[0], 'rPr')[0];
    const valueRPr = elements(elements(workSource, 'r')[2], 'rPr')[0];
    const section = createNicheSections({ component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'REMOVAL' })[0];
    const photos: PhotoData[] = Array.from({ length: 5 }, (_, index) => ({
      id: `fidelity-${index}`, sectionId: section.id, phase: 'BEFORE', reportUse: true, order: index,
      file: new File(['photo'], `${index}.jpg`), relativePath: `${index}.jpg`,
      captionText: index === 1 ? '  Port inlet  ' : index === 4 ? 'Continuation' : '   ',
    }));
    const resize = vi.fn(async () => new Uint8Array([255, 216, 7, 255, 217]));
    const result = await writeTemplateReport({
      vesselName: 'FIDELITY', sections: [section], photos: [...photos].reverse(),
      templateUrl: templatePath, vesselDiagram: vesselDiagram(),
      reportLabels: { 'NICHE/ROPE GUARD': { upperAreaLabel: 'ROPE GUARD', detailTitle: 'ROPE GUARD', photoCaption: 'Sea Chest' } },
    }, { fetchTemplate: async () => templateBytes, resize, composeDiagram });
    const output = await JSZip.loadAsync(result.blob);
    const document = parse(await output.file('word/document.xml')!.async('text'));
    expect(result.pageCount).toBe(2);
    expect(result.skipped).toEqual([]);
    const work = paragraph(document, 'WORK PERFORMED');
    expect(work.textContent?.replace(/\s+/g, ' ').trim()).toBe('WORK PERFORMED ROPE REMOVAL | BEFORE');
    expect(serialize(elements(elements(work, 'r')[0], 'rPr')[0])).toBe(serialize(labelRPr));
    const main = elements(work, 'r').find((run) => run.textContent === 'ROPE REMOVAL')!;
    expect(serialize(elements(main, 'rPr')[0])).toBe(serialize(valueRPr));
    const captions = elements(document, 'p').filter((p) => p.textContent?.startsWith('Sea Chest'));
    expect(captions.map((p) => p.textContent)).toEqual([
      'Sea Chest | Before', 'Sea Chest | Before | Port inlet', 'Sea Chest | Before', 'Sea Chest | Before', 'Sea Chest | Before | Continuation',
    ]);
    for (const p of [work, ...captions]) {
      const separators = elements(p, 'r').filter((r) => r.textContent === ' | ');
      expect(separators.length).toBeGreaterThan(0);
      for (const separator of separators) expect(elements(separator, 'position')[0]?.getAttribute('w:val')).toBe('2');
    }
    for (const [index, caption] of captions.entries()) {
      const captionSource = paragraph(source, `{{P${index + 1}}}`);
      const captionRPr = elements(elements(captionSource, 'r')[0], 'rPr')[0];
      for (const run of elements(caption, 'r')) {
        const properties = elements(run, 'rPr')[0].cloneNode(true) as Element;
        elements(properties, 'position').forEach((position) => position.remove());
        expect(serialize(properties)).toBe(serialize(captionRPr));
      }
    }
    // Five photos exercise both source page patterns; all fixed table geometry survives.
    for (const name of ['tblPr', 'tblGrid', 'trPr', 'tcW', 'sectPr']) {
      expect(elements(document, name).map(serialize)).toEqual(elements(source, name).map(serialize));
    }
    const photosDrawn = elements(document, 'inline').filter((inline) => elements(inline, 'docPr')[0]?.getAttribute('name')?.startsWith('Report photo'));
    expect(photosDrawn).toHaveLength(5);
    for (const drawing of photosDrawn) {
      for (const extent of [...elements(drawing, 'extent'), ...elements(drawing, 'ext')]) {
        expect([extent.getAttribute('cx'), extent.getAttribute('cy')]).toEqual(['3236400', '2340000']);
      }
    }
    expect(resize.mock.calls.map((call) => (call as unknown as [File])[0])).toEqual(photos.map((p) => p.file));
    expect(resize).toHaveBeenCalledWith(photos[0].file, 1798, 1300);
    for (const entry of Object.values(baseline.files).filter((file) => !file.dir)) {
      if (['word/document.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml'].includes(entry.name)) continue;
      expect(await output.file(entry.name)!.async('uint8array'), entry.name).toEqual(await entry.async('uint8array'));
    }
    const originalRelationships = parse(await baseline.file('word/_rels/document.xml.rels')!.async('text'));
    const outputRelationships = parse(await output.file('word/_rels/document.xml.rels')!.async('text'));
    for (const original of elements(originalRelationships, 'Relationship')) {
      const preserved = elements(outputRelationships, 'Relationship').find((relation) => relation.getAttribute('Id') === original.getAttribute('Id'));
      expect(serialize(preserved!)).toBe(serialize(original));
    }
    expect(Object.values(output.files).filter((file) => !file.dir && !baseline.file(file.name)).map((file) => file.name).sort()).toEqual([
      'word/media/image1.jpg', 'word/media/image2.jpg', 'word/media/image3.jpg', 'word/media/image4.jpg', 'word/media/image5.jpg', 'word/media/vessel-diagram-1.png',
    ]);
    expect(await readFile(templatePath)).toEqual(templateBytes);
  });

  it('returns failed readiness filenames in the existing skipped list while preserving successful slots', async () => {
    const [detailBytes, section14Bytes] = await Promise.all([
      readFile(templatePath),
      readFile('public/templates/section1_4_template.docx'),
    ]);
    const reportInfo = emptyReportInfo();
    const broken = new File(['bad'], 'unsupported.heic');
    const successful = new File(['photo'], 'readiness.jpg');
    reportInfo.readiness.toolboxPhotos = [broken, successful];
    reportInfo.readiness.preparationPhotos = [broken, null];
    const section = createNicheSections({ component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION' })[0];
    const photo: PhotoData = {
      id: 'SKIPPED-DETAIL', sectionId: section.id, phase: 'CURRENT', reportUse: true, order: 1,
      relativePath: 'detail-bad.jpg', file: new File(['bad'], 'detail-bad.jpg'), captionText: '',
    };
    const rendered = new Uint8Array([255, 216, 7, 255, 217]);
    const attempted: string[] = [];
    const result = await writeTemplateReport({
      vesselName: 'M.V. SKIPPED TEST', sections: [section], photos: [photo],
      templateUrl: 'templates/Detail_report_template.docx', vesselDiagram: vesselDiagram(),
      reportInfo, section14TemplateUrl: 'templates/section1_4_template.docx',
    }, {
      fetchTemplate: async () => detailBytes,
      fetchSection14Template: async () => section14Bytes,
      resize: async () => { throw new Error('Bad detail photo'); },
      resizeReadinessPhoto: async (file) => {
        attempted.push(file.name);
        if (file === broken) throw new Error('Unsupported image');
        return rendered;
      },
      composeDiagram,
    });
    expect(result.skipped).toEqual(['detail-bad.jpg', 'unsupported.heic']);
    expect(attempted).toEqual(['unsupported.heic', 'readiness.jpg', 'unsupported.heic']);
    const output = await JSZip.loadAsync(result.blob);
    expect(await output.file('word/media/image2.jpeg')!.async('uint8array')).toEqual(rendered);
    expect(await output.file('word/media/image1.jpeg')!.async('uint8array')).toEqual(await output.file('word/media/image4.jpeg')!.async('uint8array'));
    expect(await output.file('word/media/image3.jpeg')!.async('uint8array')).toEqual(await output.file('word/media/image4.jpeg')!.async('uint8array'));
  });

  it('places the populated Section 1–4 pages before detailed service records', async () => {
    const [detailBytes, section14Bytes, summaryBytes, section6Bytes, section8Bytes] = await Promise.all([
      readFile(templatePath),
      readFile('public/templates/section1_4_template.docx'),
      readFile('public/templates/summary_template.docx'),
      readFile('public/templates/section6_template.docx'),
      readFile('public/templates/section8_template.docx'),
    ]);
    const reportInfo = emptyReportInfo();
    reportInfo.vessel = {
      ...reportInfo.vessel,
      name: 'M.V. COMBINED TEST',
      imo: '1234567',
      jobNo: 'US-COMBINED-001',
    };
    reportInfo.personnelQualifications = [{
      koreanName: '곽동원',
      englishName: 'Gwak Dongwon',
      birth: '19970521',
      role: 'DIVER',
      qualification: 'Technician Diver',
      certificateNo: '19641507611A',
      issuingBody: 'HRDK',
    }];
    const section = createNicheSections({
      component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION',
    })[0];
    const photo: PhotoData = {
      id: 'COMBINED-1', sectionId: section.id, phase: 'CURRENT', reportUse: true, order: 1,
      relativePath: 'combined.jpg', file: new File(['image'], 'combined.jpg', { type: 'image/jpeg' }),
      captionText: '',
    };

    const result = await writeTemplateReport({
      vesselName: 'M.V. COMBINED TEST',
      sections: [section],
      photos: [photo],
      templateUrl: 'templates/Detail_report_template.docx',
      vesselDiagram: vesselDiagram(),
      reportInfo,
      section14TemplateUrl: 'templates/section1_4_template.docx',
      summaryTemplateUrl: 'templates/summary_template.docx',
      section6TemplateUrl: 'templates/section6_template.docx',
      section8TemplateUrl: 'templates/section8_template.docx',
    }, {
      fetchTemplate: async () => Uint8Array.from(detailBytes),
      fetchSection14Template: async () => Uint8Array.from(section14Bytes),
      fetchSummaryTemplate: async () => Uint8Array.from(summaryBytes),
      fetchSection6Template: async () => Uint8Array.from(section6Bytes),
      fetchSection8Template: async () => Uint8Array.from(section8Bytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      composeDiagram,
    });

    const output = await JSZip.loadAsync(result.blob);
    const documentXml = await output.file('word/document.xml')?.async('text') ?? '';
    const mergedDocument = new DOMParser().parseFromString(documentXml, 'application/xml');
    const documentText = mergedDocument.documentElement.textContent ?? '';
    expect(documentText).toContain('1. GENERAL INFORMATION');
    expect(documentText).toContain('M.V. COMBINED TEST');
    expect(documentText).toContain('5.1 OVERALL RESULT');
    expect(documentText).toContain('6. ASSESSMENT GUIDELINES');
    expect(documentText).toContain('7. DETAILED SERVICE RECORD');
    expect(documentText).toContain('8. QUALIFICATION & CERTIFICATION RECORDS');
    expect(documentText).toContain('Gwak Dongwon');
    expect(documentText).toContain('19641507611A');
    expect(documentText).not.toContain('19970521');
    expect(documentText).not.toContain('Im Jeongtak');
    expect(documentText.match(/5\.1 OVERALL RESULT/g)?.length).toBeGreaterThanOrEqual(2);
    expect(documentText.match(/6\. ASSESSMENT GUIDELINES/g)?.length).toBeGreaterThanOrEqual(2);
    expect(documentText.match(/7\. DETAILED SERVICE RECORD/g)?.length).toBeGreaterThanOrEqual(2);
    expect(documentText.match(/8\. QUALIFICATION & CERTIFICATION RECORDS/g)).toHaveLength(2);
    expect(documentText.indexOf('1. GENERAL INFORMATION')).toBeLessThan(documentText.lastIndexOf('5.1 OVERALL RESULT'));
    expect(documentText.lastIndexOf('5.1 OVERALL RESULT')).toBeLessThan(documentText.lastIndexOf('6. ASSESSMENT GUIDELINES'));
    expect(documentText.lastIndexOf('6. ASSESSMENT GUIDELINES')).toBeLessThan(documentText.lastIndexOf('7. DETAILED SERVICE RECORD'));
    expect(documentText.lastIndexOf('7. DETAILED SERVICE RECORD')).toBeLessThan(documentText.lastIndexOf('8. QUALIFICATION & CERTIFICATION RECORDS'));
    const bookmarkNames = new Set(Array.from(documentXml.matchAll(/<w:bookmarkStart\b[^>]*w:name="([^"]+)"/g), (match) => match[1]));
    const pageReferenceTargets = Array.from(documentXml.matchAll(/PAGEREF\s+([^\s<]+)/g), (match) => match[1]);
    expect(pageReferenceTargets.filter((target) => !bookmarkNames.has(target))).toEqual([]);
    const body = Array.from(mergedDocument.getElementsByTagNameNS('*', 'body'))[0];
    const bodyChildren = Array.from(body.children);
    const reversedDetailHeadingIndex = [...bodyChildren].reverse().findIndex((child) => (
      (child.textContent ?? '').trim().startsWith('7. DETAILED SERVICE RECORD')
    ));
    const detailHeadingIndex = bodyChildren.length - reversedDetailHeadingIndex - 1;
    expect(detailHeadingIndex).toBeGreaterThan(0);
    const boundary = bodyChildren[detailHeadingIndex - 1];
    expect(boundary.getElementsByTagNameNS('*', 'pageBreakBefore')).toHaveLength(1);
    expect((boundary.textContent ?? '').trim()).toBe('');
    expect(bodyChildren[detailHeadingIndex].getElementsByTagNameNS('*', 'pageBreakBefore')).toHaveLength(0);
    expect(documentXml.match(/<w:sectPr(?:\s|>)/g)).toHaveLength(1);
    expect(documentXml).toContain('rIdDetailedImage1');
    expect(await output.file('word/media/detail-image-1.jpg')?.async('uint8array'))
      .toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(await output.file('word/_rels/document.xml.rels')?.async('text'))
      .toContain('Target="media/detail-image-1.jpg"');
  });

  it('replaces each first-page vessel profile without changing bundled-template structure', async () => {
    const [detailBytes, section14Bytes] = await Promise.all([
      readFile(templatePath),
      readFile('public/templates/section1_4_template.docx'),
    ]);
    const source = await JSZip.loadAsync(detailBytes);
    const sourceXml = await source.file('word/document.xml')!.async('text');
    const sourceDocument = new DOMParser().parseFromString(sourceXml, 'application/xml');
    const profile = Array.from(sourceDocument.getElementsByTagNameNS('*', 'docPr'))
      .find((node) => node.getAttribute('descr') === 'vessel_profile')!;
    const sourceDrawing = profile.parentElement?.parentElement;
    const sourceProfileExtent = sourceDrawing?.getElementsByTagNameNS('*', 'extent')[0];
    if (!sourceProfileExtent) throw new Error('SOURCE_PROFILE_EXTENT_NOT_FOUND');
    const sourceExtent = [sourceProfileExtent.getAttribute('cx'), sourceProfileExtent.getAttribute('cy')];
    const sourceFonts = [...new Set(Array.from(sourceDocument.getElementsByTagNameNS('*', 'rFonts'))
      .map((font) => font.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'ascii'))
      .filter((font): font is string => Boolean(font)))];
    const sourceTableWidths = Array.from(sourceDocument.getElementsByTagNameNS('*', 'tblW'))
      .map((width) => width.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w'));
    const sections = [
      createNicheSections({ component: 'Propeller Blade', type: 'QUANTITY', quantity: 1, service: 'CLEANING' })[0],
      createNicheSections({ component: 'Transducer', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0],
      createNicheSections({ component: 'Anode / ICCP', type: 'SIDE', quantity: 1, service: 'CLEANING' })[0],
      createNicheSections({ component: 'Bilge Keel', type: 'QUANTITY', quantity: 2, service: 'CLEANING' })[1],
    ];
    const photos: PhotoData[] = sections.map((section, index) => ({
      id: `DIAGRAM-${index}`, sectionId: section.id, phase: 'BEFORE', reportUse: true, order: 1,
      relativePath: `diagram-${index}.jpg`, file: new File(['image'], `diagram-${index}.jpg`, { type: 'image/jpeg' }),
      captionText: '',
    }));
    const reportInfo = emptyReportInfo();
    reportInfo.vessel.name = 'M.V. DIAGRAM TEST';
    // Exercise the real shared composer; jsdom only substitutes Canvas raster/PNG I/O.
    const composedSelections: string[][] = [];
    const composeWordDiagram = async (config: VesselDiagramConfig, ids: string[]) => {
      composedSelections.push(ids);
      return composeVesselDiagram(config, ids, {
        decodeImage: async () => ({ width: 2048, height: 488 }),
        createCanvas: (width, height) => ({
          getContext: () => ({
            fillStyle: '', strokeStyle: '', lineWidth: 0,
            fillRect() {}, drawImage() {}, beginPath() {}, ellipse() {}, fill() {}, stroke() {}, strokeRect() {},
          } satisfies CanvasContext),
          toBlob: (callback) => callback(new Blob([`${width}x${height}`])),
        }),
      });
    };

    const result = await writeTemplateReport({
      vesselName: 'M.V. DIAGRAM TEST', sections, photos,
      templateUrl: 'templates/Detail_report_template.docx', vesselDiagram: vesselDiagram(),
      reportInfo, section14TemplateUrl: 'templates/section1_4_template.docx',
    }, {
      fetchTemplate: async () => Uint8Array.from(detailBytes),
      fetchSection14Template: async () => Uint8Array.from(section14Bytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      composeDiagram: composeWordDiagram,
    });

    const output = await JSZip.loadAsync(result.blob);
    const xml = await output.file('word/document.xml')!.async('text');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const text = document.documentElement.textContent ?? '';
    const relationships = await output.file('word/_rels/document.xml.rels')!.async('text');
    expect(result.pageCount).toBe(4);
    for (let index = 1; index <= 4; index += 1) {
      expect(relationships).toContain(`Id="rIdVesselDiagram${index}"`);
      expect(await output.file(`word/media/vessel-diagram-${index}.png`)!.async('text')).toBe('1600x381');
    }
    expect(composedSelections).toEqual([
      ['bilge-keel-2'], ['anode-aft', 'anode-fwd'], ['transducer-aft', 'transducer-fwd'], ['propeller-group'],
    ]);
    expect(xml).not.toMatch(/descr="zone_/);
    const outputExtents = Array.from(document.getElementsByTagNameNS('*', 'docPr'))
      .filter((node) => node.getAttribute('descr') === 'vessel_profile')
      .map((node) => {
        const extent = node.parentElement?.parentElement?.getElementsByTagNameNS('*', 'extent')[0];
        return [extent?.getAttribute('cx'), extent?.getAttribute('cy')];
      });
    expect(outputExtents).toHaveLength(4);
    expect(outputExtents).toEqual(Array.from({ length: 4 }, () => sourceExtent));
    for (const font of sourceFonts) expect(xml).toContain(`w:ascii="${font}"`);
    for (const width of sourceTableWidths) expect(xml).toContain(`w:w="${width}"`);
    expect(text.indexOf('1. GENERAL INFORMATION')).toBeLessThan(text.indexOf('7. DETAILED SERVICE RECORD'));
    const embeddedRelationshipIds = Array.from(document.getElementsByTagNameNS('*', 'blip'))
      .map((blip) => Array.from(blip.attributes).find((attribute) => attribute.localName === 'embed')?.value);
    expect(embeddedRelationshipIds.filter((id) => /^rIdDetailedImage\d+$/.test(id ?? ''))).toHaveLength(4);
    expect(embeddedRelationshipIds.filter((id) => /^rIdVesselDiagram\d+$/.test(id ?? ''))).toHaveLength(4);
    const detailPageStarts = Array.from(document.getElementsByTagNameNS('*', 'p'))
      .filter((paragraph) => (
        (paragraph.textContent ?? '').replace(/\s+/g, '').includes('7.DETAILEDSERVICERECORD')
        && paragraph.getElementsByTagNameNS('*', 'pageBreakBefore').length > 0
      ));
    expect(detailPageStarts).toHaveLength(3);
    for (const pageStart of detailPageStarts) {
      expect(pageStart.previousElementSibling?.localName).toBe('tbl');
    }
  });

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
      captionText: '',
      file: new File(['image'], `P${index + 1}.jpg`, { type: 'image/jpeg' }),
    }));

    const result = await writeTemplateReport({
      vesselName: 'MSC TEST',
      sections: [section],
      photos,
      templateUrl: 'templates/Detail_report_template.docx',
      vesselDiagram: vesselDiagram(),
    }, {
      fetchTemplate: async () => Uint8Array.from(templateBytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      composeDiagram,
    });

    const output = await JSZip.loadAsync(result.blob);
    const documentXml = await output.file('word/document.xml')?.async('text') ?? '';
    const documentText = new DOMParser()
      .parseFromString(documentXml, 'application/xml')
      .documentElement.textContent ?? '';
    expect(result.pageCount).toBe(2);
    expect(documentText.match(/7\. DETAILED SERVICE RECORD/g)).toHaveLength(2);
    expect(documentText).toContain('NICHE AREAS & COMPONENTS / PROPELLER');
    expect(documentText).toContain('PROPELLER BLADE 1');
    expect(documentText).not.toContain('PROPELLER BLADE 1 (Before)');
    expect(documentText).toContain('PROPELLER BLADE POLISHING | BEFORE');
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
    const pageBreak = Array.from(new DOMParser()
      .parseFromString(documentXml, 'application/xml')
      .getElementsByTagNameNS('*', 'pageBreakBefore'))[0];
    const pageProperties = pageBreak?.parentElement;
    const propertyOrder = pageProperties ? Array.from(pageProperties.children).map((child) => child.localName) : [];
    expect(propertyOrder.indexOf('pageBreakBefore')).toBeLessThan(propertyOrder.indexOf('ind'));
    expect(propertyOrder.indexOf('pageBreakBefore')).toBeLessThan(propertyOrder.indexOf('rPr'));
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
      captionText: '',
      file: new File(['image'], 'RG1.jpg', { type: 'image/jpeg' }),
    };

    const result = await writeTemplateReport({
      vesselName: 'MSC TEST',
      sections: [section],
      photos: [photo],
      templateUrl: 'templates/Detail_report_template.docx',
      vesselDiagram: vesselDiagram(),
    }, {
      fetchTemplate: async () => Uint8Array.from(templateBytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      composeDiagram,
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
      captionText: '',
      file: new File(['image'], 'RATING.jpg', { type: 'image/jpeg' }),
    };
    const result = await writeTemplateReport({
      vesselName: 'MSC TEST',
      sections: [section],
      photos: [photo],
      templateUrl: 'templates/Detail_report_template.docx',
      vesselDiagram: vesselDiagram(),
    }, {
      fetchTemplate: async () => Uint8Array.from(templateBytes),
      resize: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      composeDiagram,
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
