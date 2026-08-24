import JSZip from 'jszip';
import { resizeForPdf } from '../browser/images';
import { buildWordPhasePages } from './reportModel';
import type { PhotoData, ReportSection } from '../domain/types';

export interface WordExportInput {
  vesselName: string;
  sections: ReportSection[];
  photos: PhotoData[];
  templateUrl: string;
  fileName?: string;
}

export interface WordExportResult {
  skipped: string[];
  pageCount: number;
  blob: Blob;
}

interface WriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer>;
  resize?: (file: File, maxEdge?: number) => Promise<Uint8Array>;
  download?: (blob: Blob, fileName: string) => void;
}

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const drawingXml = (relationshipId: string, imageIndex: number) =>
  '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="2825750" cy="2119312"/><wp:docPr id="' + imageIndex + '" name="Photo ' + imageIndex + '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="' + relationshipId + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';

function replaceText(xml: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (next, [token, value]) => next.replaceAll(token, escapeXml(value)),
    xml,
  );
}

function addRelationship(xml: string, id: string, target: string): string {
  const relation = '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + target + '"/>';
  return xml.replace('</Relationships>', relation + '</Relationships>');
}

export async function writeTemplateReport(
  input: WordExportInput,
  dependencies: WriterDependencies = {},
): Promise<WordExportResult> {
  const fetchTemplate = dependencies.fetchTemplate ?? (async () => {
    const response = await fetch(input.templateUrl);
    if (!response.ok) throw new Error('TEMPLATE_LOAD_FAILED');
    return response.arrayBuffer();
  });
  const resize = dependencies.resize ?? resizeForPdf;
  const template = await fetchTemplate();
  const zip = await JSZip.loadAsync(template);
  const documentEntry = zip.file('word/document.xml');
  const relationshipEntry = zip.file('word/_rels/document.xml.rels');
  if (!documentEntry || !relationshipEntry) throw new Error('TEMPLATE_INVALID');

  const pages = buildWordPhasePages(input.sections, input.photos);
  if (!pages.length) throw new Error('NO_REPORT_PHOTOS');
  const templateXml = await documentEntry.async('text');
  let relationshipsXml = await relationshipEntry.async('text');
  const body = templateXml.match(/^(.*<w:body>)([\s\S]*?)(<w:sectPr(?:\s[^>]*)?\/>|<w:sectPr[\s\S]*?<\/w:sectPr>)(<\/w:body>[\s\S]*)$/);
  if (!body) throw new Error('TEMPLATE_BODY_INVALID');
  const skipped: string[] = [];
  let imageIndex = 0;
  const renderedBodies: string[] = [];
  for (const page of pages) {
    let pageXml = replaceText(body[2], {
      '{{BC}}': page.values.bc, '{{SIDE_LABEL}}': page.values.sideLabel,
      '{{TITLE}}': page.values.title, '{{WORK}}': page.values.work,
      '@FR': page.values.fr, '{{FT}}': page.values.ft, '{{FC}}': page.values.fc,
      '@OR': page.values.or, '{{OL}}': page.values.ol, '{{OT}}': page.values.ot,
    });
    for (let index = 0; index < page.photos.length; index += 1) {
      const photo = page.photos[index];
      const slot = page.kind === 'first' ? index + 1 : index + 5;
      const token = '{{P' + slot + '}}';
      imageIndex += 1;
      try {
        const bytes = await resize(photo.file, 1800);
        const name = 'image' + imageIndex + '.jpg';
        const relationId = 'rIdReportImage' + imageIndex;
        zip.file('word/media/' + name, bytes);
        relationshipsXml = addRelationship(relationshipsXml, relationId, name);
        const placeholderRun = new RegExp(`<w:r(?:\\s[^>]*)?>(?:(?!</w:r>)[\\s\\S])*?<w:t(?:\\s[^>]*)?>\\{\\{P${slot}\\}\\}</w:t>(?:(?!</w:r>)[\\s\\S])*?</w:r>`);
        pageXml = pageXml.replace(placeholderRun, drawingXml(relationId, imageIndex));
      } catch {
        skipped.push(photo.file.name);
        pageXml = pageXml.replaceAll(token, '');
      }
    }
    const firstSlot = page.kind === 'first' ? 1 : 5;
    const usedSlots = new Set(page.photos.map((_, index) => firstSlot + index));
    for (let slot = 1; slot <= 10; slot += 1) {
      if (!usedSlots.has(slot)) pageXml = pageXml.replaceAll('{{P' + slot + '}}', '');
    }
    renderedBodies.push(pageXml);
  }
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const documentXml = body[1] + renderedBodies.join(pageBreak) + body[3] + body[4];
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relationshipsXml);
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const fileName = input.fileName ?? input.vesselName.replace(/[^a-z0-9]+/gi, '_') + '_UNDERWATER_SERVICE_REPORT.docx';
  dependencies.download?.(blob, fileName);
  return { skipped, pageCount: pages.length, blob };
}
