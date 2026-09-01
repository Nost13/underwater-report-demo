import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
import type { VesselDiagramConfig } from '../vesselDiagram/types';
import { writeTemplateReport } from './templateWriter';

const vesselDiagram = (): VesselDiagramConfig => ({
  imageFile: new File(['vessel'], 'vessel.png', { type: 'image/png' }),
  imageName: 'vessel.png',
  calibration: { sternX: 0.08, bowX: 0.92, hullTopY: 0.15, bottomY: 0.86 },
  confirmed: true,
  hullMarkers: [],
  nicheMarkers: [
    { id: 'propeller-group', groupId: 'propeller-group', shape: 'ELLIPSE', rect: { x: .1, y: .1, width: .1, height: .1 } },
    { id: 'transducer-aft', groupId: 'transducer', shape: 'ELLIPSE', rect: { x: .2, y: .2, width: .1, height: .1 } },
    { id: 'transducer-fwd', groupId: 'transducer', shape: 'ELLIPSE', rect: { x: .3, y: .3, width: .1, height: .1 } },
  ],
});

const reportPhoto = (sectionId: string): PhotoData => ({
  id: 'VESSEL-PHOTO', sectionId, phase: 'BEFORE', reportUse: true, order: 1,
  relativePath: 'vessel-photo.jpg', file: new File(['image'], 'vessel-photo.jpg', { type: 'image/jpeg' }),
});

async function fixtureTemplate(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:r><w:t>7. DETAILED SERVICE RECORD</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{{BC}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{{TITLE}}</w:t></w:r></w:p><w:p><w:r><w:t>{{WORK}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:extent cx="5301000" cy="1260000"/><wp:docPr id="10" name="vessel_profile" descr="vessel_profile" title="Vessel profile base image"/><a:graphic><a:graphicData><a:blip r:embed="rId11"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    + '<w:p><w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="11" name="zone_fwd" descr="zone_fwd"/></wp:anchor></w:drawing></w:r></w:p>'
    + '<w:p><w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="12" name="zone_bilge" descr="zone_bilge_keel&#10;zone_transducer"/></wp:anchor></w:drawing></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>@FR {{FT}} {{FC}} @OR {{OL}} {{OT}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:tbl>'
    + '<w:tr><w:trPr><w:trHeight w:val="3686"/></w:trPr><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{{P1}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{{P2}}</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:trPr><w:trHeight w:val="3686"/></w:trPr><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{{P3}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{{P4}}</w:t></w:r></w:p></w:tc></w:tr>'
    + '</w:tbl>'
    + '<w:p><w:r><w:t>7. DETAILED SERVICE RECORD</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>{{BC}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:tbl>'
    + '<w:tr><w:trPr><w:trHeight w:val="3686"/></w:trPr><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>{{P5}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{P6}}</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:trPr><w:trHeight w:val="3686"/></w:trPr><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>{{P7}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{P8}}</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:trPr><w:trHeight w:val="3686"/></w:trPr><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:shd w:fill="F2F2F2"/></w:tcPr><w:p/></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>{{P9}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{P10}}</w:t></w:r></w:p></w:tc></w:tr>'
    + '</w:tbl>'
    + '<w:sectPr/></w:body></w:document>');
  zip.file('word/header1.xml', '<header>ORIGINAL HEADER</header>');
  zip.file('word/footer1.xml', '<footer>ORIGINAL FOOTER</footer>');
  zip.file('word/styles.xml', '<styles>ORIGINAL STYLES</styles>');
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>');
  zip.file('word/media/image1.png', new Uint8Array([0]));
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('template Word writer', () => {
  it('replaces the vessel profile with a composed diagram and removes legacy zone anchors', async () => {
    const section = createNicheSections({ component: 'Transducer', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const config = vesselDiagram();
    const composeDiagram = vi.fn(async (_config: VesselDiagramConfig, ids: string[]) => new TextEncoder().encode(ids.join(',')));

    const result = await writeTemplateReport({
      vesselName: 'M.V. TEST', sections: [section], photos: [reportPhoto(section.id)], templateUrl: '/template.docx', vesselDiagram: config,
    }, {
      fetchTemplate: fixtureTemplate,
      resize: async () => new Uint8Array([1, 2, 3]),
      composeDiagram,
    });

    const zip = await JSZip.loadAsync(result.blob);
    const xml = await zip.file('word/document.xml')!.async('text');
    expect(composeDiagram).toHaveBeenCalledWith(config, ['transducer-aft', 'transducer-fwd']);
    expect(xml).not.toContain('descr="zone_');
    expect(xml).toContain('cx="5301000" cy="1260000"');
    expect(xml).toContain('r:embed="rIdVesselDiagram1"');
    expect(await zip.file('word/media/vessel-diagram-1.png')!.async('text')).toBe('transducer-aft,transducer-fwd');
  });

  it('rejects a linked marker pair when one resolved marker is not configured', async () => {
    const section = createNicheSections({ component: 'Transducer', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const config = vesselDiagram();
    config.nicheMarkers = config.nicheMarkers.filter((marker) => marker.id !== 'transducer-fwd');

    await expect(writeTemplateReport({
      vesselName: 'M.V. TEST', sections: [section], photos: [reportPhoto(section.id)], templateUrl: '/template.docx', vesselDiagram: config,
    }, {
      fetchTemplate: fixtureTemplate,
      resize: async () => new Uint8Array([1, 2, 3]),
      composeDiagram: vi.fn(),
    })).rejects.toThrow(`VESSEL_MARKER_NOT_FOUND:${section.id}`);
  });

  it('rejects an unconfirmed vessel diagram before exporting', async () => {
    const section = createNicheSections({ component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const config = vesselDiagram();
    config.confirmed = false;

    await expect(writeTemplateReport({
      vesselName: 'M.V. TEST', sections: [section], photos: [reportPhoto(section.id)], templateUrl: '/template.docx', vesselDiagram: config,
    }, { fetchTemplate: fixtureTemplate })).rejects.toThrow('VESSEL_DIAGRAM_UNCONFIRMED');
  });

  it('includes the section when vessel composition fails', async () => {
    const section = createNicheSections({ component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];

    await expect(writeTemplateReport({
      vesselName: 'M.V. TEST', sections: [section], photos: [reportPhoto(section.id)], templateUrl: '/template.docx', vesselDiagram: vesselDiagram(),
    }, {
      fetchTemplate: fixtureTemplate,
      composeDiagram: async () => { throw new Error('png encoding failed'); },
    })).rejects.toThrow(`VESSEL_DIAGRAM_COMPOSITION_FAILED:${section.id}`);
  });

  it('preserves header and footer while filling text and the first photo slot', async () => {
    const section = createNicheSections({ component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    section.conditions.BEFORE = {
      fouling: { coverage: 6, slimeOnly: false, type: 'Medium Macro Fouling' },
      observed: { level: 'Normal / Trace', type: '' },
    };
    const photo: PhotoData = {
      id: 'P1', sectionId: section.id, phase: 'BEFORE', reportUse: true, order: 1,
      relativePath: 'P1.jpg', file: new File(['image'], 'P1.jpg', { type: 'image/jpeg' }),
    };
    const result = await writeTemplateReport({
      vesselName: 'M.V. TEST',
      sections: [section],
      photos: [photo],
      templateUrl: '/template.docx',
      vesselDiagram: vesselDiagram(),
    }, {
      fetchTemplate: fixtureTemplate,
      resize: async () => new Uint8Array([1, 2, 3]),
      download: () => undefined,
      composeDiagram: async () => new Uint8Array([137, 80, 78, 71]),
    });

    const zip = await JSZip.loadAsync(result.blob);
    expect(await zip.file('word/header1.xml')?.async('text')).toBe('<header>ORIGINAL HEADER</header>');
    expect(await zip.file('word/footer1.xml')?.async('text')).toBe('<footer>ORIGINAL FOOTER</footer>');
    expect(await zip.file('word/styles.xml')?.async('text')).toBe('<styles>ORIGINAL STYLES</styles>');
    const documentXml = await zip.file('word/document.xml')?.async('text') ?? '';
    expect(documentXml).toContain('NICHE AREAS &amp; COMPONENTS / BOSS CAP');
    expect(documentXml).not.toContain('{{P1}}');
    expect(documentXml).toContain('<pic:nvPicPr>');
    expect(documentXml).toContain('<a:stretch><a:fillRect/></a:stretch>');
    expect(documentXml).toContain('<a:xfrm>');
    expect(documentXml).toContain('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
    const document = new DOMParser().parseFromString(documentXml, 'application/xml');
    const captionRow = Array.from(document.getElementsByTagNameNS('*', 'tr'))
      .find((row) => row.textContent?.includes('Boss Cap'));
    expect(captionRow).toBeDefined();
    expect(captionRow?.getElementsByTagNameNS('*', 'drawing')).toHaveLength(0);
    expect(captionRow?.previousElementSibling?.getElementsByTagNameNS('*', 'drawing')).toHaveLength(1);
    const extent = captionRow?.previousElementSibling?.getElementsByTagNameNS('*', 'extent')[0];
    expect(extent?.getAttribute('cx')).toBe('3236400');
    expect(extent?.getAttribute('cy')).toBe('2340000');
    expect(await zip.file('word/media/image1.jpg')?.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await zip.file('[Content_Types].xml')?.async('text')).toContain('Extension="jpg"');
    const naParagraph = Array.from(document.getElementsByTagNameNS('*', 'p'))
      .find((paragraph) => paragraph.textContent?.trim() === 'N/A');
    expect(naParagraph).toBeDefined();
    expect(naParagraph?.getElementsByTagNameNS('*', 'sz')[0]?.getAttributeNS(
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'val',
    )).toBe('18');
  });

  it('writes a separate template body for Before and After in phase order', async () => {
    const section = createNicheSections({ component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const photos: PhotoData[] = ['BEFORE', 'AFTER'].map((phase, index) => ({
      id: phase, sectionId: section.id, phase: phase as 'BEFORE' | 'AFTER', reportUse: true, order: index + 1,
      relativePath: phase + '.jpg', file: new File(['image'], phase + '.jpg', { type: 'image/jpeg' }),
    }));
    const result = await writeTemplateReport({ vesselName: 'M.V. TEST', sections: [section], photos, templateUrl: '/template.docx', vesselDiagram: vesselDiagram(), workPerformLabels: {
      [`${section.id}::BEFORE`]: 'Arrival',
      [`${section.id}::AFTER`]: 'After',
    } }, {
      fetchTemplate: fixtureTemplate, resize: async () => new Uint8Array([1, 2, 3]), download: () => undefined,
      composeDiagram: async () => new Uint8Array([137, 80, 78, 71]),
    });
    const xml = await (await JSZip.loadAsync(result.blob)).file('word/document.xml')?.async('text');
    expect(result.pageCount).toBe(2);
    expect(xml).not.toContain('BOSS CAP (Before)');
    expect(xml).not.toContain('BOSS CAP (After)');
    expect(xml).toContain('Cleaning Arrival');
    expect(xml).toContain('Cleaning After');
    expect(xml).not.toContain('w:type="page"');
    expect(xml?.match(/pageBreakBefore/g)).toHaveLength(1);
  });

  it('marks a failed image as skipped and leaves N/A in its caption slot', async () => {
    const section = createNicheSections({ component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const failed: PhotoData = {
      id: 'FAILED', sectionId: section.id, phase: 'BEFORE', reportUse: true, order: 1,
      relativePath: 'failed.jpg', file: new File(['bad'], 'failed.jpg', { type: 'image/jpeg' }),
    };
    const result = await writeTemplateReport({ vesselName: 'M.V. TEST', sections: [section], photos: [failed], templateUrl: '/template.docx', vesselDiagram: vesselDiagram() }, {
      fetchTemplate: fixtureTemplate,
      resize: async () => { throw new Error('bad image'); },
      composeDiagram: async () => new Uint8Array([137, 80, 78, 71]),
    });
    const xml = await (await JSZip.loadAsync(result.blob)).file('word/document.xml')?.async('text') ?? '';
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const captions = Array.from(document.getElementsByTagNameNS('*', 'p'))
      .map((paragraph) => paragraph.textContent?.trim())
      .filter((text) => text === 'N/A');

    expect(result.skipped).toEqual(['failed.jpg']);
    expect(captions).toHaveLength(4);
  });

  it('uses the first template block once and the continuation block for photos five through ten', async () => {
    const section = createNicheSections({ component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const photos: PhotoData[] = Array.from({ length: 5 }, (_, index) => ({
      id: 'B' + (index + 1), sectionId: section.id, phase: 'BEFORE', reportUse: true, order: index + 1,
      relativePath: 'B' + (index + 1) + '.jpg', file: new File(['image'], 'B' + (index + 1) + '.jpg', { type: 'image/jpeg' }),
    }));
    const result = await writeTemplateReport({ vesselName: 'M.V. TEST', sections: [section], photos, templateUrl: '/template.docx', vesselDiagram: vesselDiagram() }, {
      fetchTemplate: fixtureTemplate, resize: async () => new Uint8Array([1, 2, 3]), download: () => undefined,
      composeDiagram: async () => new Uint8Array([137, 80, 78, 71]),
    });
    const zip = await JSZip.loadAsync(result.blob);
    const xml = await zip.file('word/document.xml')?.async('text') ?? '';
    expect(result.pageCount).toBe(2);
    expect(xml).not.toContain('BOSS CAP (Before)');
    expect(xml).toContain('Cleaning Before');
    expect(xml.match(/7\. DETAILED SERVICE RECORD/g)).toHaveLength(2);
    expect(xml).not.toMatch(/\{\{(?:P\d+|BC|TITLE|WORK|FT|FC|OL|OT|SIDE_LABEL)\}\}|@(?:FR|OR)/);
    expect(zip.file('word/media/image5.jpg')).not.toBeNull();
  });
});
