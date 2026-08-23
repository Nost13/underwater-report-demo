import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import type { PhotoData } from '../domain/types';
import { writeTemplateReport } from './templateWriter';

async function fixtureTemplate(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>{{BC}}</w:t></w:r></w:p><w:p><w:r><w:t>{{TITLE}}</w:t></w:r></w:p><w:p><w:r><w:t>{{P1}}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>');
  zip.file('word/header1.xml', '<header>ORIGINAL HEADER</header>');
  zip.file('word/footer1.xml', '<footer>ORIGINAL FOOTER</footer>');
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('template Word writer', () => {
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
    }, {
      fetchTemplate: fixtureTemplate,
      resize: async () => new Uint8Array([1, 2, 3]),
      download: () => undefined,
    });

    const zip = await JSZip.loadAsync(result.blob);
    expect(await zip.file('word/header1.xml')?.async('text')).toBe('<header>ORIGINAL HEADER</header>');
    expect(await zip.file('word/footer1.xml')?.async('text')).toBe('<footer>ORIGINAL FOOTER</footer>');
    expect(await zip.file('word/document.xml')?.async('text')).toContain('NICHE AREAS &amp; COMPONENTS / BOSS CAP');
    expect(await zip.file('word/document.xml')?.async('text')).not.toContain('{{P1}}');
    expect(await zip.file('word/media/image1.jpg')?.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('writes a separate template body for Before and After in phase order', async () => {
    const section = createNicheSections({ component: 'Boss Cap', type: 'SINGLE', quantity: 1, service: 'CLEANING' })[0];
    const photos: PhotoData[] = ['BEFORE', 'AFTER'].map((phase, index) => ({
      id: phase, sectionId: section.id, phase: phase as 'BEFORE' | 'AFTER', reportUse: true, order: index + 1,
      relativePath: phase + '.jpg', file: new File(['image'], phase + '.jpg', { type: 'image/jpeg' }),
    }));
    const result = await writeTemplateReport({ vesselName: 'M.V. TEST', sections: [section], photos, templateUrl: '/template.docx' }, {
      fetchTemplate: fixtureTemplate, resize: async () => new Uint8Array([1, 2, 3]), download: () => undefined,
    });
    const xml = await (await JSZip.loadAsync(result.blob)).file('word/document.xml')?.async('text');
    expect(result.pageCount).toBe(2);
    expect(xml).toContain('BOSS CAP (Before)');
    expect(xml).toContain('BOSS CAP (After)');
    expect(xml?.indexOf('BOSS CAP (Before)')).toBeLessThan(xml?.indexOf('BOSS CAP (After)') ?? 0);
  });
});
