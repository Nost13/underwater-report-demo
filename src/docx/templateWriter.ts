import JSZip from 'jszip';
import { resizeForReport } from '../browser/images';
import { buildWordPhasePages } from './reportModel';
import { RATING_FILLS } from './ratingPalette';
import { fillSection14Template } from './section14Writer';
import type { ReportInfo } from '../app/reportInfo';
import type { PhotoData, ReportLabelMap, ReportSection } from '../domain/types';
import type { VesselDiagramConfig } from '../vesselDiagram/types';

export interface WordExportInput {
  vesselName: string;
  sections: ReportSection[];
  photos: PhotoData[];
  templateUrl: string;
  reportLabels?: ReportLabelMap;
  reportInfo?: ReportInfo;
  section14TemplateUrl?: string;
  vesselDiagram?: VesselDiagramConfig;
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
  fetchSection14Template?: () => Promise<ArrayBuffer | Uint8Array>;
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

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PHOTO_WIDTH_EMU = 3_236_400;
const PHOTO_HEIGHT_EMU = 2_340_000;
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

function parseFragment(xml: string): Document {
  const document = new DOMParser().parseFromString(`<root xmlns:w="${WORD_NAMESPACE}">${xml}</root>`, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('TEMPLATE_FRAGMENT_INVALID');
  return document;
}

function serializeFragment(document: Document): string {
  const serializer = new XMLSerializer();
  return Array.from(document.documentElement.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('');
}

function markPageStart(document: Document): void {
  const paragraph = Array.from(document.documentElement.children)
    .find((element) => element.localName === 'p')
    ?? Array.from(document.getElementsByTagNameNS('*', 'p'))[0];
  if (!paragraph) throw new Error('TEMPLATE_PAGE_START_INVALID');
  let properties = directChildren(paragraph, 'pPr')[0];
  if (!properties) {
    properties = document.createElementNS(WORD_NAMESPACE, 'w:pPr');
    paragraph.insertBefore(properties, paragraph.firstChild);
  }
  if (!directChildren(properties, 'pageBreakBefore').length) {
    const pageBreak = document.createElementNS(WORD_NAMESPACE, 'w:pageBreakBefore');
    const allowedBefore = new Set(['pStyle', 'keepNext', 'keepLines']);
    const insertionPoint = Array.from(properties.children)
      .find((child) => !allowedBefore.has(child.localName));
    properties.insertBefore(pageBreak, insertionPoint ?? null);
  }
}

function paragraphText(paragraph: Element): string {
  return Array.from(paragraph.getElementsByTagNameNS('*', 't'))
    .map((node) => node.textContent ?? '')
    .join('');
}

function closestElement(element: Element, localName: string): Element | null {
  let current: Element | null = element;
  while (current && current.localName !== localName) current = current.parentElement;
  return current;
}

function directChildren(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function setRatingCellFill(document: Document, token: string, rating: string): void {
  const fill = RATING_FILLS[rating];
  if (!fill) return;
  const paragraph = Array.from(document.getElementsByTagNameNS('*', 'p'))
    .find((item) => paragraphText(item).includes(token));
  const cell = paragraph ? closestElement(paragraph, 'tc') : null;
  const cellProperties = cell ? directChildren(cell, 'tcPr')[0] : undefined;
  if (!cellProperties) return;
  let shading = directChildren(cellProperties, 'shd')[0];
  if (!shading) {
    shading = document.createElementNS(WORD_NAMESPACE, 'w:shd');
    cellProperties.appendChild(shading);
  }
  shading.setAttributeNS(WORD_NAMESPACE, 'w:fill', fill);
}

function replaceText(document: Document, values: Record<string, string>): void {
  const paragraphs = Array.from(document.getElementsByTagNameNS('*', 'p'));
  for (const paragraph of paragraphs) {
    for (const [token, value] of Object.entries(values)) replaceTokenInParagraph(paragraph, token, value);
  }
}

function insertPhotoAboveCaption(
  document: Document,
  token: string,
  relationshipId: string,
  imageIndex: number,
  caption: string,
): void {
  const captionParagraph = Array.from(document.getElementsByTagNameNS('*', 'p'))
    .find((paragraph) => paragraphText(paragraph).includes(token));
  const captionCell = captionParagraph ? closestElement(captionParagraph, 'tc') : null;
  const captionRow = captionCell ? closestElement(captionCell, 'tr') : null;
  const imageRow = captionRow?.previousElementSibling;
  if (!captionParagraph || !captionCell || !captionRow || imageRow?.localName !== 'tr') {
    throw new Error('TEMPLATE_PHOTO_SLOT_INVALID');
  }
  const captionCells = directChildren(captionRow, 'tc');
  const imageCells = directChildren(imageRow, 'tc');
  const cellIndex = captionCells.indexOf(captionCell);
  const imageCell = imageCells[cellIndex];
  const imageParagraph = imageCell ? directChildren(imageCell, 'p')[0] : undefined;
  if (!imageParagraph) throw new Error('TEMPLATE_PHOTO_SLOT_INVALID');

  const drawingDocument = new DOMParser().parseFromString(
    `<root xmlns:w="${WORD_NAMESPACE}">${drawingXml(relationshipId, imageIndex)}</root>`,
    'application/xml',
  );
  const drawingRun = drawingDocument.documentElement.firstElementChild;
  if (!drawingRun || drawingDocument.querySelector('parsererror')) throw new Error('PHOTO_XML_INVALID');
  imageParagraph.appendChild(document.importNode(drawingRun, true));
  replaceTokenInParagraph(captionParagraph, token, caption);
}

function addRelationship(xml: string, id: string, target: string): string {
  const relation = '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + target + '"/>';
  return xml.replace('</Relationships>', relation + '</Relationships>');
}

function splitBody(xml: string): { prefix: string; body: string; sectionProperties: string; suffix: string } {
  const open = xml.match(/<w:body(?:\s[^>]*)?>/);
  const closeIndex = xml.lastIndexOf('</w:body>');
  if (!open || open.index === undefined || closeIndex < 0) throw new Error('REPORT_BODY_INVALID');
  const bodyStart = open.index + open[0].length;
  const body = xml.slice(bodyStart, closeIndex);
  const sectionStart = body.lastIndexOf('<w:sectPr');
  const sectionEnd = body.lastIndexOf('</w:sectPr>');
  if (sectionStart < 0 || sectionEnd < sectionStart) throw new Error('REPORT_SECTION_PROPERTIES_INVALID');
  return {
    prefix: xml.slice(0, bodyStart),
    body: body.slice(0, sectionStart),
    sectionProperties: body.slice(sectionStart, sectionEnd + '</w:sectPr>'.length),
    suffix: xml.slice(closeIndex),
  };
}

function ensureJpegContentType(xml: string): string {
  return /<Default[^>]+Extension="jpg"/i.test(xml)
    ? xml
    : xml.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
}

function relationshipTarget(xml: string, id: string): string | null {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<Relationship\\s+[^>]*Id="${escaped}"[^>]*Target="([^"]+)"[^>]*/>`));
  return match?.[1] ?? null;
}

async function prependSection14Package(
  section14Blob: Blob,
  detailedBlob: Blob,
): Promise<Blob> {
  const [section14Zip, detailedZip] = await Promise.all([
    JSZip.loadAsync(section14Blob),
    JSZip.loadAsync(detailedBlob),
  ]);
  const [section14DocumentEntry, detailedDocumentEntry, section14RelationshipsEntry, detailedRelationshipsEntry, section14ContentTypesEntry] = [
    section14Zip.file('word/document.xml'),
    detailedZip.file('word/document.xml'),
    section14Zip.file('word/_rels/document.xml.rels'),
    detailedZip.file('word/_rels/document.xml.rels'),
    section14Zip.file('[Content_Types].xml'),
  ];
  if (!section14DocumentEntry || !detailedDocumentEntry || !section14RelationshipsEntry || !detailedRelationshipsEntry || !section14ContentTypesEntry) {
    throw new Error('REPORT_PACKAGE_INVALID');
  }
  const [section14DocumentXml, detailedDocumentXml, section14RelationshipsXml, detailedRelationshipsXml, section14ContentTypesXml] = await Promise.all([
    section14DocumentEntry.async('text'),
    detailedDocumentEntry.async('text'),
    section14RelationshipsEntry.async('text'),
    detailedRelationshipsEntry.async('text'),
    section14ContentTypesEntry.async('text'),
  ]);
  const section14Parts = splitBody(section14DocumentXml);
  const detailedParts = splitBody(detailedDocumentXml);
  let mergedRelationshipsXml = section14RelationshipsXml;
  let detailedBody = detailedParts.body;
  const embedIds = [...new Set(Array.from(detailedBody.matchAll(/r:embed="([^"]+)"/g), (match) => match[1]))];
  for (let index = 0; index < embedIds.length; index += 1) {
    const originalId = embedIds[index];
    const target = relationshipTarget(detailedRelationshipsXml, originalId);
    if (!target) throw new Error(`REPORT_IMAGE_RELATIONSHIP_NOT_FOUND:${originalId}`);
    const source = detailedZip.file(`word/${target}`);
    if (!source) throw new Error(`REPORT_IMAGE_NOT_FOUND:${target}`);
    const extension = target.match(/\.([^.]+)$/)?.[1] ?? 'jpg';
    const copiedName = `detail-image-${index + 1}.${extension}`;
    const replacementId = `rIdDetailedImage${index + 1}`;
    section14Zip.file(`word/media/${copiedName}`, await source.async('uint8array'));
    mergedRelationshipsXml = addRelationship(mergedRelationshipsXml, replacementId, copiedName);
    detailedBody = detailedBody.replaceAll(`r:embed="${originalId}"`, `r:embed="${replacementId}"`);
  }
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  section14Zip.file(
    'word/document.xml',
    section14Parts.prefix + section14Parts.body + pageBreak + detailedBody + section14Parts.sectionProperties + section14Parts.suffix,
  );
  section14Zip.file('word/_rels/document.xml.rels', mergedRelationshipsXml);
  section14Zip.file('[Content_Types].xml', ensureJpegContentType(section14ContentTypesXml));
  return section14Zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
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

  const pages = buildWordPhasePages(input.sections, input.photos, input.reportLabels);
  if (!pages.length) throw new Error('NO_REPORT_PHOTOS');
  const templateXml = await documentEntry.async('text');
  const documentParts = splitTemplateDocument(templateXml);
  let relationshipsXml = await relationshipEntry.async('text');
  let contentTypesXml = await contentTypesEntry.async('text');
  contentTypesXml = ensureJpegContentType(contentTypesXml);
  const skipped: string[] = [];
  let imageIndex = 0;
  const renderedBodies: string[] = [];
  for (const page of pages) {
    const pageDocument = parseFragment(page.kind === 'first' ? documentParts.firstBody : documentParts.continuationBody);
    if (renderedBodies.length > 0) markPageStart(pageDocument);
    setRatingCellFill(pageDocument, '@FR', page.values.fr);
    setRatingCellFill(pageDocument, '@OR', page.values.or);
    replaceText(pageDocument, {
      '{{BC}}': page.values.bc, '{{SIDE_LABEL}}': page.values.sideLabel,
      '{{TITLE}}': page.values.title, '{{WORK}}': page.values.work,
      '@FR': page.values.fr, '{{FT}}': page.values.ft, '{{FC}}': page.values.fc,
      '@OR': page.values.or, '{{OL}}': page.values.ol, '{{OT}}': page.values.ot,
    });
    const caption = page.values.photoCaption;
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
        insertPhotoAboveCaption(pageDocument, token, relationId, imageIndex, caption);
      } catch {
        skipped.push(photo.file.name);
        replaceText(pageDocument, { [token]: 'N/A' });
      }
    }
    const firstSlot = page.kind === 'first' ? 1 : 5;
    const usedSlots = new Set(page.photos.map((_, index) => firstSlot + index));
    for (let slot = 1; slot <= 10; slot += 1) {
      if (!usedSlots.has(slot)) replaceText(pageDocument, { ['{{P' + slot + '}}']: 'N/A' });
    }
    renderedBodies.push(serializeFragment(pageDocument));
  }
  const documentXml = documentParts.prefix + renderedBodies.join('') + documentParts.sectionProperties + documentParts.suffix;
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', relationshipsXml);
  zip.file('[Content_Types].xml', contentTypesXml);
  let blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  if (input.reportInfo && input.section14TemplateUrl) {
    const section14Blob = await fillSection14Template({
      reportInfo: input.reportInfo,
      templateUrl: input.section14TemplateUrl,
    }, {
      fetchTemplate: dependencies.fetchSection14Template,
    });
    blob = await prependSection14Package(section14Blob, blob);
  }
  const fileName = input.fileName ?? input.vesselName.replace(/[^a-z0-9]+/gi, '_') + '_UNDERWATER_SERVICE_REPORT.docx';
  dependencies.download?.(blob, fileName);
  return { skipped, pageCount: pages.length, blob };
}
