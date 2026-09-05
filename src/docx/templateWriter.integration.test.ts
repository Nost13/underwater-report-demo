import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
import { emptyReportInfo } from '../app/reportInfo';
import type { VesselDiagramConfig } from '../vesselDiagram/types';
import { composeVesselDiagram, type CanvasContext } from '../vesselDiagram/composer';
import { writeTemplateReport } from './templateWriter';

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
