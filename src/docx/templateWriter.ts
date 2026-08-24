import JSZip from 'jszip';
import { resizeForReport } from '../browser/images';
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
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
  resize?: (file: File, maxEdge?: number) => Promise<Uint8Array>;
  download?: (blob: Blob, fileName: string) => void;
}

interface DocumentParts {
  prefix: string;
  firstBody: string;
  continuationBody: string;
  sectionProperties: string;
  suffix: string;
}

function splitTemplateDocument(xml: string): DocumentParts {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('TEMPLATE_XML_INVALID');
  const body = Array.from(document.getElementsByTagNameNS('*', 'body'))[0];
  if (!body) throw new Error('TEMPLATE_BODY_INVALID');
  const children = Array.from(body.children);
  const sectionIndex = children.findIndex((child) => child.localName === 'sectPr');
  const photoFiveIndex = children.findIndex((child) => child.textContent?.includes('{{P5}}'));
  if (sectionIndex < 0 || photoFiveIndex < 0) throw new Error('TEMPLATE_BLOCKS_INVALID');
  let continuationStart = photoFiveIndex;
  while (continuationStart > 0) {
    continuationStart -= 1;
    if (children[continuationStart].textContent?.includes('7. DETAILED SERVICE RECORD')) break;
  }
  const serializer = new XMLSerializer();
  const bodyOpen = xml.match(/<w:body(?:\s[^>]*)?>/);
  const bodyClose = xml.lastIndexOf('</w:body>');
  if (!bodyOpen || bodyOpen.index === undefined || bodyClose < 0) throw new Error('TEMPLATE_BODY_INVALID');
  const start = bodyOpen.index + bodyOpen[0].length;
  return {
    prefix: xml.slice(0, start),
    firstBody: children.slice(0, continuationStart).map((node) => serializer.serializeToString(node)).join(''),
    continuationBody: children.slice(continuationStart, sectionIndex).map((node) => serializer.serializeToString(node)).join(''),
    sectionProperties: serializer.serializeToString(children[sectionIndex]),
    suffix: xml.slice(bodyClose),
  };
}

const PHOTO_WIDTH_EMU = 2_825_750;
const PHOTO_HEIGHT_EMU = 2_119_312;

const drawingXml = (relationshipId: string, imageIndex: number) => [
  '<w:r><w:drawing>',
  '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">',
  `<wp:extent cx="${PHOTO_WIDTH_EMU}" cy="${PHOTO_HEIGHT_EMU}"/>`,
  `<wp:docPr id="${imageIndex}" name="Report photo ${imageIndex}"/>`,
  '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>',
  '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
  '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
  '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">',
  '<pic:nvPicPr>',
  `<pic:cNvPr id="${imageIndex}" name="Report photo ${imageIndex}.jpg"/>`,
  '<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>',
  '</pic:nvPicPr>',
  '<pic:blipFill>',
  `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relationshipId}"/>`,
  '<a:stretch><a:fillRect/></a:stretch>',
  '</pic:blipFill>',
  '<pic:spPr bwMode="auto">',
  '<a:xfrm>',
  '<a:off x="0" y="0"/>',
  `<a:ext cx="${PHOTO_WIDTH_EMU}" cy="${PHOTO_HEIGHT_EMU}"/>`,
  '</a:xfrm>',
  '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
  '<a:noFill/>',
  '<a:ln><a:noFill/></a:ln>',
  '</pic:spPr>',
  '</pic:pic>',
  '</a:graphicData>',
  '</a:graphic>',
  '</wp:inline>',
  '</w:drawing></w:r>',
].join('');

function replaceTokenInParagraph(paragraph: Element, token: string, value: string): void {
  while (true) {
    const textNodes = Array.from(paragraph.getElementsByTagNameNS('*', 't'));
    const combined = textNodes.map((node) => node.textContent ?? '').join('');
    const tokenStart = combined.indexOf(token);
    if (tokenStart < 0) return;
    const tokenEnd = tokenStart + token.length;
    let cursor = 0;
    let startIndex = -1;
    let endIndex = -1;
    let startOffset = 0;
    let endOffset = 0;
    for (let index = 0; index < textNodes.length; index += 1) {
      const length = textNodes[index].textContent?.length ?? 0;
      if (startIndex < 0 && tokenStart < cursor + length) {
        startIndex = index;
        startOffset = tokenStart - cursor;
      }
      if (tokenEnd <= cursor + length) {
        endIndex = index;
        endOffset = tokenEnd - cursor;
        break;
      }
      cursor += length;
    }
    if (startIndex < 0 || endIndex < 0) return;
    const startText = textNodes[startIndex].textContent ?? '';
    const endText = textNodes[endIndex].textContent ?? '';
    if (startIndex === endIndex) {
      textNodes[startIndex].textContent = startText.slice(0, startOffset) + value + startText.slice(endOffset);
      continue;
    }
    textNodes[startIndex].textContent = startText.slice(0, startOffset) + value;
    for (let index = startIndex + 1; index < endIndex; index += 1) textNodes[index].textContent = '';
    textNodes[endIndex].textContent = endText.slice(endOffset);
  }
}

function replaceText(xml: string, values: Record<string, string>): string {
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const document = new DOMParser().parseFromString(`<root xmlns:w="${namespace}">${xml}</root>`, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('TEMPLATE_FRAGMENT_INVALID');
  const paragraphs = Array.from(document.getElementsByTagNameNS('*', 'p'));
  for (const paragraph of paragraphs) {
    for (const [token, value] of Object.entries(values)) replaceTokenInParagraph(paragraph, token, value);
  }
  const serializer = new XMLSerializer();
  return Array.from(document.documentElement.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('');
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
  const resize = dependencies.resize ?? resizeForReport;
  const template = await fetchTemplate();
  const zip = await JSZip.loadAsync(template);
  const documentEntry = zip.file('word/document.xml');
  const relationshipEntry = zip.file('word/_rels/document.xml.rels');
  const contentTypesEntry = zip.file('[Content_Types].xml');
  if (!documentEntry || !relationshipEntry || !contentTypesEntry) throw new Error('TEMPLATE_INVALID');

  const pages = buildWordPhasePages(input.sections, input.photos);
  if (!pages.length) throw new Error('NO_REPORT_PHOTOS');
  const templateXml = await documentEntry.async('text');
  const documentParts = splitTemplateDocument(templateXml);
  let relationshipsXml = await relationshipEntry.async('text');
  let contentTypesXml = await contentTypesEntry.async('text');
  if (!/<Default[^>]+Extension="jpg"/i.test(contentTypesXml)) {
    contentTypesXml = contentTypesXml.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
  }
  const skipped: string[] = [];
  let imageIndex = 0;
  const renderedBodies: string[] = [];
  for (const page of pages) {
    let pageXml = replaceText(page.kind === 'first' ? documentParts.firstBody : documentParts.continuationBody, {
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
  const documentXml = documentParts.prefix + renderedBodies.join(pageBreak) + documentParts.sectionProperties + documentParts.suffix;
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relationshipsXml);
  zip.file('[Content_Types].xml', contentTypesXml);
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const fileName = input.fileName ?? input.vesselName.replace(/[^a-z0-9]+/gi, '_') + '_UNDERWATER_SERVICE_REPORT.docx';
  dependencies.download?.(blob, fileName);
  return { skipped, pageCount: pages.length, blob };
}
