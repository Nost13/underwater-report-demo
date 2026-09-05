import JSZip from 'jszip';
import { resizeForReportSlot } from '../browser/images';
import { composePhotoCaption } from '../domain/photos';
import { setSeparatedRuns } from './ooxmlText';
import { buildWordPhasePages } from './reportModel';
import { RATING_FILLS } from './ratingPalette';
import { fillSection14Template, type Section14WriterDependencies } from './section14Writer';
import { fillSummaryTemplate } from './summaryWriter';
import { fillCoverTemplate, type CoverWriterDependencies } from './coverWriter';
import type { CoverInfo } from '../app/coverInfo';
import type { ReportInfo } from '../app/reportInfo';
import type { DiverQualification } from '../app/diverQualifications';
import type { PhotoData, ReportLabelMap, ReportSection, WorkPerformLabelMap } from '../domain/types';
import type { VesselDiagramConfig } from '../vesselDiagram/types';
import { composeVesselDiagram, type ComposeDependencies } from '../vesselDiagram/composer';
import { resolveMarkerIds } from '../vesselDiagram/markers';

export interface WordExportInput {
  vesselName: string;
  sections: ReportSection[];
  photos: PhotoData[];
  templateUrl: string;
  reportLabels?: ReportLabelMap;
  workPerformLabels?: WorkPerformLabelMap;
  reportInfo?: ReportInfo;
  coverInfo?: CoverInfo;
  coverTemplateUrl?: string;
  section14TemplateUrl?: string;
  summaryTemplateUrl?: string;
  section6TemplateUrl?: string;
  section8TemplateUrl?: string;
  vesselDiagram: VesselDiagramConfig;
  fileName?: string;
}

export interface WordExportResult {
  skipped: string[];
  pageCount: number;
  blob: Blob;
}

interface WriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
  resize?: typeof resizeForReportSlot;
  download?: (blob: Blob, fileName: string) => void;
  fetchSection14Template?: () => Promise<ArrayBuffer | Uint8Array>;
  fetchCoverTemplate?: CoverWriterDependencies['fetchTemplate'];
  renderCoverPhoto?: CoverWriterDependencies['renderPhoto'];
  resizeReadinessPhoto?: Section14WriterDependencies['resizePhoto'];
  fetchSummaryTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
  fetchSection6Template?: () => Promise<ArrayBuffer | Uint8Array>;
  fetchSection8Template?: () => Promise<ArrayBuffer | Uint8Array>;
  composeDiagram?: (
    config: VesselDiagramConfig,
    markerIds: string[],
    options?: Pick<ComposeDependencies, 'trimOuterWhitespace'>,
  ) => Promise<Uint8Array>;
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
const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
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
  const document = new DOMParser().parseFromString(
    `<root xmlns:w="${WORD_NAMESPACE}" xmlns:r="${RELATIONSHIP_NAMESPACE}">${xml}</root>`,
    'application/xml',
  );
  if (document.querySelector('parsererror')) throw new Error('TEMPLATE_FRAGMENT_INVALID');
  return document;
}

function serializeFragment(document: Document): string {
  const serializer = new XMLSerializer();
  return Array.from(document.documentElement.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('');
}

function trimTrailingEmptyParagraphs(document: Document): void {
  while (true) {
    const last = document.documentElement.lastElementChild;
    if (
      !last
      || last.localName !== 'p'
      || paragraphText(last).trim()
      || last.getElementsByTagNameNS('*', 'drawing').length
    ) return;
    last.remove();
  }
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

function replaceWorkPerformed(document: Document, main: string, phase: string): void {
  for (const paragraph of Array.from(document.getElementsByTagNameNS('*', 'p'))) {
    if (!paragraphText(paragraph).includes('{{WORK}}')) continue;
    // The source has a differently styled label followed by a split Arial value token.
    // Compose only the token runs so the label, spacing and paragraph remain intact.
    const runs = directChildren(paragraph, 'r');
    const combined = runs.map(paragraphText).join('');
    const start = combined.indexOf('{{WORK}}');
    const end = start + '{{WORK}}'.length;
    let offset = 0;
    const valueRuns = runs.filter((run) => {
      const runStart = offset;
      offset += paragraphText(run).length;
      return runStart < end && offset > start;
    });
    const first = valueRuns[0];
    if (!first) continue;
    const values = document.createElementNS(WORD_NAMESPACE, 'w:p');
    values.appendChild(first.cloneNode(true));
    setSeparatedRuns(values, [main, phase]);
    for (const run of Array.from(values.children)) paragraph.insertBefore(run, first);
    valueRuns.forEach((run) => run.remove());
    const labelTexts = runs.filter((run) => !valueRuns.includes(run))
      .flatMap((run) => Array.from(run.getElementsByTagNameNS('*', 't')));
    for (const text of labelTexts) {
      text.textContent = (text.textContent ?? '').replace(/\bWORK PERFORM\b/, 'WORK PERFORMED');
    }
  }
}

function insertPhotoAboveCaption(
  document: Document,
  token: string,
  relationshipId: string,
  imageIndex: number,
  caption: string[],
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
  setSeparatedRuns(captionParagraph, caption);
}

function addRelationship(xml: string, id: string, target: string): string {
  const relation = '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + target + '"/>';
  return xml.replace('</Relationships>', relation + '</Relationships>');
}

function ensurePngContentType(xml: string): string {
  return /<Default[^>]+Extension="png"/i.test(xml)
    ? xml
    : xml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
}

function replaceVesselProfile(document: Document, relationshipId: string): void {
  const profile = Array.from(document.getElementsByTagNameNS('*', 'docPr'))
    .find((node) => node.getAttribute('descr') === 'vessel_profile' || node.getAttribute('name') === 'vessel_profile');
  const drawing = profile ? closestElement(profile, 'drawing') : null;
  const blip = drawing ? drawing.getElementsByTagNameNS('*', 'blip')[0] : undefined;
  if (!blip) throw new Error('VESSEL_PROFILE_DRAWING_NOT_FOUND');
  for (const attribute of Array.from(blip.attributes)) {
    if (attribute.localName === 'embed') blip.removeAttributeNode(attribute);
  }
  blip.setAttribute('r:embed', relationshipId);
}

function hasLegacyZoneDescription(description: string | null): boolean {
  return (description ?? '').split(/\r?\n/).some((line) => line.startsWith('zone_'));
}

function removeLegacyZoneShapes(document: Document): void {
  const zoneRuns = Array.from(document.getElementsByTagNameNS('*', 'docPr'))
    .filter((node) => hasLegacyZoneDescription(node.getAttribute('descr')))
    .map((node) => {
      const anchor = closestElement(node, 'anchor');
      return anchor ? closestElement(anchor, 'r') : null;
    })
    .filter((run): run is Element => run !== null);
  for (const run of zoneRuns) run.remove();
  if (Array.from(document.getElementsByTagNameNS('*', 'docPr'))
    .some((node) => hasLegacyZoneDescription(node.getAttribute('descr')))) {
    throw new Error('LEGACY_ZONE_SHAPES_REMAIN');
  }
}

function assertDiagramMarkers(config: VesselDiagramConfig, markerIds: string[], section: ReportSection): void {
  const configuredIds = new Set([...config.hullMarkers, ...config.nicheMarkers].map((marker) => marker.id));
  if (!markerIds.length || markerIds.some((id) => !configuredIds.has(id))) {
    throw new Error(`VESSEL_MARKER_NOT_FOUND:${section.id}`);
  }
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

interface PackagePart {
  blob: Blob;
  prefix: string;
  placement?: 'base' | 'prepend' | 'append';
}

export function buildReportFileName(jobNo: string, vesselName: string): string {
  const clean = (value: string) => Array.from(value).filter((char) => char.charCodeAt(0) >= 32)
    .join('').replace(/[<>:"/\\|?*]/g, '').trim().replace(/[. ]+$/, '');
  const job = clean(jobNo);
  const vessel = clean(vesselName);
  if (job && vessel) return `${job}_${vessel}_Underwater service report(Detail).docx`;
  const fallback = vessel.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return `${fallback ? `${fallback}_` : ''}UNDERWATER_SERVICE_REPORT.docx`;
}

const CONTENT_TYPE_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

function packagePath(owner: string, target: string): string {
  const segments = (target.startsWith('/') ? target.slice(1) : owner.slice(0, owner.lastIndexOf('/') + 1) + target).split('/');
  const result: string[] = [];
  for (const segment of segments) {
    if (segment === '..') {
      if (!result.length) throw new Error('REPORT_PART_PATH_INVALID');
      result.pop();
    } else if (segment && segment !== '.') result.push(segment);
  }
  return result.join('/');
}

function partRelationshipsPath(part: string): string {
  const slash = part.lastIndexOf('/');
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

/** Copy the cover's complete relationship closure. IDs in dependent parts are
 * local to those parts and stay unchanged; only their targets need remapping. */
async function importCoverPackage(source: JSZip, base: JSZip, relationshipsXml: string, typesXml: string) {
  const parse = (xml: string) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('REPORT_PACKAGE_XML_INVALID');
    return doc;
  };
  const read = async (path: string) => {
    const entry = source.file(path);
    if (!entry) throw new Error(`REPORT_PART_NOT_FOUND:${path}`);
    return entry.async('text');
  };
  const sourceXml = await read('word/document.xml');
  const document = parse(sourceXml);
  const sourceRels = parse(await read('word/_rels/document.xml.rels'));
  const sourceTypes = parse(await read('[Content_Types].xml'));
  const mergedRels = parse(relationshipsXml);
  const mergedTypes = parse(typesXml);
  const serializer = new XMLSerializer();
  const relations = Array.from(sourceRels.getElementsByTagNameNS('*', 'Relationship'));
  const copied = new Map<string, string>();
  const copyPart = async (path: string): Promise<string> => {
    const previous = copied.get(path);
    if (previous) return previous;
    const sourcePart = source.file(path);
    if (!sourcePart) throw new Error(`REPORT_PART_NOT_FOUND:${path}`);
    const slash = path.lastIndexOf('/');
    const preferred = `${path.slice(0, slash + 1)}cover-${path.slice(slash + 1)}`;
    let destination = preferred;
    let suffix = 2;
    while (base.file(destination)) destination = preferred.replace(/(\.[^.]*)?$/, `-${suffix++}$1`);
    copied.set(path, destination);
    base.file(destination, await sourcePart.async('uint8array'), { createFolders: false });
    const override = Array.from(sourceTypes.getElementsByTagNameNS('*', 'Override')).find((node) => node.getAttribute('PartName') === `/${path}`);
    const defaultType = Array.from(sourceTypes.getElementsByTagNameNS('*', 'Default')).find((node) => node.getAttribute('Extension') === path.split('.').pop());
    const contentType = (override ?? defaultType)?.getAttribute('ContentType');
    if (!contentType) throw new Error(`REPORT_PART_CONTENT_TYPE_MISSING:${path}`);
    const type = mergedTypes.createElementNS(CONTENT_TYPE_NS, 'Override');
    type.setAttribute('PartName', `/${destination}`);
    type.setAttribute('ContentType', contentType);
    mergedTypes.documentElement.appendChild(type);
    const sourcePartRels = source.file(partRelationshipsPath(path));
    if (sourcePartRels) {
      const relDoc = parse(await sourcePartRels.async('text'));
      for (const relation of Array.from(relDoc.getElementsByTagNameNS('*', 'Relationship'))) {
        if (relation.getAttribute('TargetMode') === 'External') continue;
        relation.setAttribute('Target', `/${await copyPart(packagePath(path, relation.getAttribute('Target')!))}`);
      }
      base.file(partRelationshipsPath(destination), serializer.serializeToString(relDoc), { createFolders: false });
    }
    return destination;
  };
  const bodyElement = document.getElementsByTagNameNS(WORD_NAMESPACE, 'body')[0];
  if (!bodyElement) throw new Error('REPORT_BODY_INVALID');
  const idMap = new Map<string, string>();
  const referenceNames = new Set<string>();
  for (const element of [bodyElement, ...Array.from(bodyElement.getElementsByTagName('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI !== RELATIONSHIP_NAMESPACE && !(attribute.namespaceURI === 'urn:schemas-microsoft-com:office:office' && attribute.localName === 'relid')) continue;
      referenceNames.add(attribute.name);
      const originalId = attribute.value;
      if (idMap.has(originalId)) continue;
      const relation = relations.find((r) => r.getAttribute('Id') === originalId);
      if (!relation) throw new Error(`REPORT_RELATIONSHIP_NOT_FOUND:${originalId}`);
      const id = uniqueRelationshipId(serializer.serializeToString(mergedRels), `rIdCover_${originalId}`);
      const imported = mergedRels.importNode(relation, true) as Element;
      imported.setAttribute('Id', id);
      if (relation.getAttribute('TargetMode') !== 'External') {
        const destination = await copyPart(packagePath('word/document.xml', relation.getAttribute('Target')!));
        imported.setAttribute('Target', `/${destination}`);
      }
      mergedRels.documentElement.appendChild(imported);
      idMap.set(originalId, id);
    }
  }
  // Patch only relationship attribute values; keep grouped shapes and anchors raw.
  const parts = splitBody(sourceXml);
  const referencePattern = new RegExp(`\\b(${[...referenceNames].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})="([^"]+)"`, 'g');
  const remap = (xml: string) => xml.replace(referencePattern, (match, name: string, id: string) => idMap.has(id) ? `${name}="${idMap.get(id)}"` : match);
  return {
    ...parts, body: remap(parts.body), sectionProperties: remap(parts.sectionProperties),
    relationshipsXml: serializer.serializeToString(mergedRels), typesXml: serializer.serializeToString(mergedTypes),
    namespaces: Array.from(document.documentElement.attributes).filter((a) => a.name.startsWith('xmlns:')),
  };
}

function pageStartParagraph(): string {
  return '<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>';
}

function startBodyOnNewPage(body: string, sourceXml: string): string {
  const document = new DOMParser().parseFromString(sourceXml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('REPORT_PACKAGE_INVALID');
  const sourceBody = document.getElementsByTagNameNS(WORD_NAMESPACE, 'body')[0];
  const paragraph = sourceBody?.firstElementChild;
  if (paragraph?.localName !== 'p') throw new Error('TEMPLATE_PAGE_START_INVALID');
  markPageStart(document);
  const properties = directChildren(paragraph, 'pPr')[0];
  const serialized = new XMLSerializer().serializeToString(properties);
  // Patch only the first paragraph properties. A separate break paragraph adds
  // a line at the top of the imported page and can overflow fixed source tables.
  return body.replace(/^(\s*<w:p\b[^>]*>\s*)(?:<w:pPr\b[^>]*\/>|<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>)?/, `$1${serialized}`);
}

function ensureSummaryTocBookmarks(xml: string): string {
  return xml.replace(/PAGEREF\s+_Toc233757655/g, 'PAGEREF _Toc233757656');
}

function normalizeDrawingIds(xml: string): string {
  const properties = /(<wp:docPr\b[^>]*?\sid=")(\d+)(")/g;
  // Reserve the entire document first: an early duplicate must not consume an
  // otherwise unique ID belonging to a later drawing (including report photos).
  const reserved = new Set(Array.from(xml.matchAll(properties), (match) => Number(match[2])));
  const seen = new Set<number>();
  let nextId = 1;
  return xml.replace(properties, (original, opening: string, value: string, closing: string) => {
    const id = Number(value);
    if (!seen.has(id)) {
      seen.add(id);
      return original;
    }
    while (reserved.has(nextId)) nextId += 1;
    reserved.add(nextId);
    return `${opening}${nextId++}${closing}`;
  });
}

function uniqueRelationshipId(xml: string, preferred: string): string {
  let candidate = preferred;
  let suffix = 2;
  while (new RegExp(`\\bId="${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(xml)) {
    candidate = `${preferred}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function mergeReportPackages(parts: PackagePart[]): Promise<Blob> {
  const packages = await Promise.all(parts.map(async (part) => ({
    ...part,
    zip: await JSZip.loadAsync(part.blob),
  })));
  const base = packages.find((part) => part.placement === 'base') ?? packages[0];
  const baseDocumentEntry = base.zip.file('word/document.xml');
  const baseRelationshipsEntry = base.zip.file('word/_rels/document.xml.rels');
  const baseContentTypesEntry = base.zip.file('[Content_Types].xml');
  if (!baseDocumentEntry || !baseRelationshipsEntry || !baseContentTypesEntry) {
    throw new Error('REPORT_PACKAGE_INVALID');
  }
  const [baseDocumentXml, baseRelationshipsXml, baseContentTypesXml] = await Promise.all([
    baseDocumentEntry.async('text'),
    baseRelationshipsEntry.async('text'),
    baseContentTypesEntry.async('text'),
  ]);
  const baseParts = splitBody(baseDocumentXml);
  let mergedRelationshipsXml = baseRelationshipsXml;
  let mergedContentTypesXml = baseContentTypesXml;
  let documentPrefix = baseParts.prefix;
  const prependedBodies: string[] = [];
  const appendedBodies: string[] = [];
  for (const part of packages.filter((part) => part !== base)) {
    if (part.placement === 'prepend') {
      const cover = await importCoverPackage(part.zip, base.zip, mergedRelationshipsXml, mergedContentTypesXml);
      mergedRelationshipsXml = cover.relationshipsXml;
      mergedContentTypesXml = cover.typesXml;
      for (const attribute of cover.namespaces) {
        if (!documentPrefix.includes(`${attribute.name}=`)) documentPrefix = documentPrefix.replace('<w:document ', `<w:document ${attribute.name}="${attribute.value}" `);
      }
      // Cover has its own empty header and copyright, despite common A4 geometry.
      const differentSection = cover.sectionProperties.replace(/\s+w:rsid\w+="[^"]*"/g, '')
        !== baseParts.sectionProperties.replace(/\s+w:rsid\w+="[^"]*"/g, '');
      if (differentSection) {
        const section = cover.sectionProperties.replace(/<w:type\b[^>]*\/>/g, '')
          .replace(/(<w:pgSz\b)/, '<w:type w:val="nextPage"/>$1');
        const lastParagraph = cover.body.lastIndexOf('<w:p ');
        const end = cover.body.lastIndexOf('</w:p>');
        if (lastParagraph < 0 || end < lastParagraph) throw new Error('COVER_SECTION_BREAK_INVALID');
        const tail = cover.body.slice(lastParagraph);
        const withSection = tail.includes('</w:pPr>')
          ? tail.replace('</w:pPr>', `${section}</w:pPr>`)
          : tail.replace(/(<w:p\b[^>]*>)/, `$1<w:pPr>${section}</w:pPr>`);
        prependedBodies.push(cover.body.slice(0, lastParagraph) + withSection);
      } else prependedBodies.push(cover.body + pageStartParagraph());
      continue;
    }
    const documentEntry = part.zip.file('word/document.xml');
    const relationshipsEntry = part.zip.file('word/_rels/document.xml.rels');
    if (!documentEntry || !relationshipsEntry) throw new Error('REPORT_PACKAGE_INVALID');
    const [documentXml, relationshipsXml] = await Promise.all([
      documentEntry.async('text'),
      relationshipsEntry.async('text'),
    ]);
    let body = splitBody(documentXml).body;
    const embedIds = [...new Set(Array.from(body.matchAll(/(?:\b[\w.-]+:)?embed="([^"]+)"/g), (match) => match[1]))];
    let imageIndex = 0;
    for (const originalId of embedIds) {
      const target = relationshipTarget(relationshipsXml, originalId);
      if (!target) throw new Error(`REPORT_IMAGE_RELATIONSHIP_NOT_FOUND:${originalId}`);
      const source = part.zip.file(`word/${target}`);
      if (!source) throw new Error(`REPORT_IMAGE_NOT_FOUND:${target}`);
      const extension = target.match(/\.([^.]+)$/)?.[1] ?? 'png';
      const isVesselDiagram = part.prefix === 'detail' && /^rIdVesselDiagram\d+$/.test(originalId);
      if (!isVesselDiagram) imageIndex += 1;
      const copiedName = isVesselDiagram
        ? target.slice(target.lastIndexOf('/') + 1)
        : `${part.prefix}-image-${imageIndex}.${extension}`;
      const preferredId = isVesselDiagram
        ? originalId
        : part.prefix === 'detail'
          ? `rIdDetailedImage${imageIndex}`
          : `rId${part.prefix[0].toUpperCase()}${part.prefix.slice(1)}Image${imageIndex}`;
      const replacementId = uniqueRelationshipId(mergedRelationshipsXml, preferredId);
      base.zip.file(`word/media/${copiedName}`, await source.async('uint8array'));
      mergedRelationshipsXml = addRelationship(mergedRelationshipsXml, replacementId, copiedName);
      const escapedId = originalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      body = body.replace(
        new RegExp(`((?:\\b[\\w.-]+:)?embed=")${escapedId}(")`, 'g'),
        `$1${replacementId}$2`,
      );
    }
    appendedBodies.push(startBodyOnNewPage(body, documentXml));
  }
  const mergedDocumentXml = documentPrefix
    + prependedBodies.join('')
    + baseParts.body
    + appendedBodies.join('')
    + baseParts.sectionProperties
    + baseParts.suffix;
  base.zip.file(
    'word/document.xml',
    normalizeDrawingIds(packages.some((part) => part.prefix === 'summary')
      ? ensureSummaryTocBookmarks(mergedDocumentXml)
      : mergedDocumentXml),
  );
  base.zip.file('word/_rels/document.xml.rels', mergedRelationshipsXml);
  base.zip.file('[Content_Types].xml', ensurePngContentType(ensureJpegContentType(mergedContentTypesXml)));
  return base.zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function setElementText(element: Element, value: string): void {
  const textNodes = Array.from(element.getElementsByTagNameNS('*', 't'));
  if (!textNodes.length) return;
  textNodes[0].textContent = value;
  textNodes.slice(1).forEach((node) => { node.textContent = ''; });
}

async function prepareSection8Template(
  bytes: ArrayBuffer | Uint8Array,
  personnel: readonly DiverQualification[] = [],
): Promise<Blob> {
  const zip = await JSZip.loadAsync(bytes);
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) throw new Error('SECTION8_TEMPLATE_INVALID');
  const document = new DOMParser().parseFromString(await documentEntry.async('text'), 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('SECTION8_TEMPLATE_XML_INVALID');
  const tables = Array.from(document.getElementsByTagNameNS('*', 'tbl'))
    .filter((table) => !closestElement(table.parentElement as Element, 'tbl'));
  const qualificationTables = tables.filter((table) => {
    const row = directChildren(table, 'tr')[0];
    const heading = row ? paragraphText(row) : '';
    return heading.includes('NAME') && heading.includes('QUALIFICATION') && heading.includes('CERTIFICATE NO.');
  });
  for (const [tableIndex, table] of qualificationTables.entries()) {
    const rows = directChildren(table, 'tr');
    const templateRow = rows[1];
    rows.slice(1).forEach((row) => row.remove());
    if (!templateRow) continue;
    const records = tableIndex === 0 && personnel.length ? personnel : [null];
    for (const [personIndex, person] of records.entries()) {
      const recordRow = templateRow.cloneNode(true) as Element;
      const cells = directChildren(recordRow, 'tc');
      const values = person ? [
        String(personIndex + 1),
        person.englishName,
        person.role,
        person.qualification,
        person.certificateNo,
        person.issuingBody,
      ] : ['', '', '', '', '', ''];
      cells.forEach((cell, cellIndex) => setElementText(cell, values[cellIndex] ?? ''));
      table.appendChild(recordRow);
    }
  }
  const body = Array.from(document.getElementsByTagNameNS('*', 'body'))[0];
  const sectionProperties = body ? directChildren(body, 'sectPr')[0] : undefined;
  if (!body) throw new Error('SECTION8_TEMPLATE_BODY_INVALID');
  const contentChildren = Array.from(body.children).filter((child) => child !== sectionProperties);
  const repeatedHeading = contentChildren.filter((child) => (
    paragraphText(child).includes('8. QUALIFICATION & CERTIFICATION RECORDS')
  ))[1];
  if (repeatedHeading) {
    let removeRemainder = false;
    for (const child of Array.from(body.children)) {
      if (child === repeatedHeading) removeRemainder = true;
      if (removeRemainder && child !== sectionProperties) child.remove();
    }
  }
  let passedFirstPage = false;
  for (const child of Array.from(body.children)) {
    if (child === sectionProperties) continue;
    if (passedFirstPage) {
      child.remove();
      continue;
    }
    const hasBreak = Array.from(child.getElementsByTagNameNS('*', 'br'))
      .some((node) => node.getAttributeNS(WORD_NAMESPACE, 'type') === 'page');
    if (hasBreak) {
      passedFirstPage = true;
      if (!paragraphText(child)) child.remove();
    }
    Array.from(child.getElementsByTagNameNS('*', 'lastRenderedPageBreak')).forEach((node) => node.remove());
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(document));
  return zip.generateAsync({
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
  const resize = dependencies.resize ?? resizeForReportSlot;
  const composeDiagram = dependencies.composeDiagram ?? composeVesselDiagram;
  if (!input.vesselDiagram?.confirmed) throw new Error('VESSEL_DIAGRAM_UNCONFIRMED');
  const template = await fetchTemplate();
  const zip = await JSZip.loadAsync(template);
  const documentEntry = zip.file('word/document.xml');
  const relationshipEntry = zip.file('word/_rels/document.xml.rels');
  const contentTypesEntry = zip.file('[Content_Types].xml');
  if (!documentEntry || !relationshipEntry || !contentTypesEntry) throw new Error('TEMPLATE_INVALID');

  const pages = buildWordPhasePages(input.sections, input.photos, input.reportLabels, input.workPerformLabels);
  if (!pages.length) throw new Error('NO_REPORT_PHOTOS');
  const templateXml = await documentEntry.async('text');
  const documentParts = splitTemplateDocument(templateXml);
  let relationshipsXml = await relationshipEntry.async('text');
  let contentTypesXml = await contentTypesEntry.async('text');
  contentTypesXml = ensureJpegContentType(contentTypesXml);
  contentTypesXml = ensurePngContentType(contentTypesXml);
  const skipped: string[] = [];
  let imageIndex = 0;
  let diagramIndex = 0;
  const renderedBodies: string[] = [];
  for (const page of pages) {
    const pageDocument = parseFragment(page.kind === 'first' ? documentParts.firstBody : documentParts.continuationBody);
    if (renderedBodies.length > 0) markPageStart(pageDocument);
    setRatingCellFill(pageDocument, '@FR', page.values.fr);
    setRatingCellFill(pageDocument, '@OR', page.values.or);
    replaceWorkPerformed(pageDocument, page.values.work, page.values.workAdditional);
    replaceText(pageDocument, {
      '{{BC}}': page.values.bc, '{{SIDE_LABEL}}': page.values.sideLabel,
      '{{TITLE}}': page.values.title,
      '@FR': page.values.fr, '{{FT}}': page.values.ft, '{{FC}}': page.values.fc,
      '@OR': page.values.or, '{{OL}}': page.values.ol, '{{OT}}': page.values.ot,
    });
    if (page.kind === 'first') {
      const markerIds = resolveMarkerIds(page.section);
      assertDiagramMarkers(input.vesselDiagram, markerIds, page.section);
      let diagram: Uint8Array;
      try {
        diagram = await composeDiagram(input.vesselDiagram, markerIds, { trimOuterWhitespace: true });
      } catch {
        throw new Error(`VESSEL_DIAGRAM_COMPOSITION_FAILED:${page.section.id}`);
      }
      diagramIndex += 1;
      const diagramName = `vessel-diagram-${diagramIndex}.png`;
      const diagramRelationshipId = `rIdVesselDiagram${diagramIndex}`;
      zip.file(
        `word/media/${diagramName}`,
        Array.from(diagram),
      );
      relationshipsXml = addRelationship(relationshipsXml, diagramRelationshipId, diagramName);
      replaceVesselProfile(pageDocument, diagramRelationshipId);
      removeLegacyZoneShapes(pageDocument);
    }
    for (let index = 0; index < page.photos.length; index += 1) {
      const photo = page.photos[index];
      const slot = page.kind === 'first' ? index + 1 : index + 5;
      const token = '{{P' + slot + '}}';
      imageIndex += 1;
      try {
        // Exact 3236400:2340000 slot ratio at approximately 1800 px wide.
        const bytes = await resize(photo.file, PHOTO_WIDTH_EMU / 1800, PHOTO_HEIGHT_EMU / 1800);
        const name = 'image' + imageIndex + '.jpg';
        const relationId = 'rIdReportImage' + imageIndex;
        zip.file('word/media/' + name, bytes);
        relationshipsXml = addRelationship(relationshipsXml, relationId, name);
        insertPhotoAboveCaption(pageDocument, token, relationId, imageIndex,
          composePhotoCaption(page.values.photoCaption, page.phase, photo.captionText));
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
    trimTrailingEmptyParagraphs(pageDocument);
    renderedBodies.push(serializeFragment(pageDocument));
  }
  const documentXml = documentParts.prefix + renderedBodies.join('') + documentParts.sectionProperties + documentParts.suffix;
  zip.file('word/document.xml', input.reportInfo && input.section14TemplateUrl ? documentXml : normalizeDrawingIds(documentXml));
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
      resizePhoto: dependencies.resizeReadinessPhoto,
      onPhotoSkipped: (fileName) => {
        if (!skipped.includes(fileName)) skipped.push(fileName);
      },
    });
    const finalParts: PackagePart[] = [{ blob: section14Blob, prefix: 'section14', placement: 'base' }];
    if (input.coverInfo && input.coverTemplateUrl) {
      finalParts.unshift({
        blob: await fillCoverTemplate({
          coverInfo: input.coverInfo, reportInfo: input.reportInfo, sections: input.sections, templateUrl: input.coverTemplateUrl,
        }, {
          fetchTemplate: dependencies.fetchCoverTemplate,
          renderPhoto: dependencies.renderCoverPhoto,
          onPhotoSkipped: (fileName) => skipped.push(fileName),
        }),
        prefix: 'cover', placement: 'prepend',
      });
    }
    if (input.summaryTemplateUrl) {
      finalParts.push({
        blob: await fillSummaryTemplate({ sections: input.sections, templateUrl: input.summaryTemplateUrl }, {
          fetchTemplate: dependencies.fetchSummaryTemplate,
        }),
        prefix: 'summary',
      });
    }
    if (input.section6TemplateUrl) {
      const bytes = dependencies.fetchSection6Template
        ? await dependencies.fetchSection6Template()
        : await (await fetch(input.section6TemplateUrl)).arrayBuffer();
      finalParts.push({ blob: new Blob([bytes as BlobPart]), prefix: 'section6' });
    }
    finalParts.push({ blob, prefix: 'detail' });
    if (input.section8TemplateUrl) {
      const bytes = dependencies.fetchSection8Template
        ? await dependencies.fetchSection8Template()
        : await (await fetch(input.section8TemplateUrl)).arrayBuffer();
      finalParts.push({
        blob: await prepareSection8Template(bytes, input.reportInfo.personnelQualifications),
        prefix: 'section8',
      });
    }
    blob = await mergeReportPackages(finalParts);
  }
  const fileName = input.fileName ?? buildReportFileName(input.reportInfo?.vessel.jobNo ?? '', input.vesselName);
  dependencies.download?.(blob, fileName);
  return { skipped: [...new Set(skipped)], pageCount: pages.length, blob };
}
