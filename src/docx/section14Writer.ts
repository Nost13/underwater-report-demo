import JSZip from 'jszip';
import type { ReportInfo } from '../app/reportInfo';
import { resizeForReportSlot } from '../browser/images';
import { setCellLines, setElementTextPreservingRun } from './ooxmlText';

const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// Opaque 4:3 white JPEG, replacing sample photos even when no browser canvas is needed.
const WHITE_JPEG = '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z';

export interface Section14ExportInput {
  reportInfo: ReportInfo;
  templateUrl: string;
}

export interface Section14WriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
  resizePhoto?: (file: File, width: number, height: number) => Promise<Uint8Array>;
  onPhotoSkipped?: (fileName: string) => void;
}

function directChildren(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function textIn(element: Element): string {
  return Array.from(element.getElementsByTagNameNS('*', 't')).map((node) => node.textContent ?? '').join('');
}

function tableByHeading(document: Document, heading: string): Element {
  const table = Array.from(document.getElementsByTagNameNS('*', 'tbl'))
    .find((item) => textIn(item).includes(heading));
  if (!table) throw new Error(`SECTION14_TABLE_NOT_FOUND:${heading}`);
  return table;
}

function rowCells(table: Element, rowIndex: number): Element[] {
  const row = directChildren(table, 'tr')[rowIndex];
  if (!row) throw new Error(`SECTION14_ROW_NOT_FOUND:${rowIndex}`);
  return directChildren(row, 'tc');
}

function setCell(table: Element, row: number, cell: number, value: string): void {
  const target = rowCells(table, row)[cell];
  if (!target) throw new Error(`SECTION14_CELL_NOT_FOUND:${row}:${cell}`);
  setElementTextPreservingRun(target, value);
}

function dateLines(value: string): string[] {
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
  if (iso) {
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso[2]) - 1];
    if (month) return [`${iso[3]} ${month} ${iso[1]},`, iso[4]];
  }
  const formatted = /^(.*?,)\s*(\d{1,2}:\d{2})$/.exec(value);
  return formatted ? [formatted[1], formatted[2]] : [value];
}

function fillGeneralInfo(document: Document, info: ReportInfo): void {
  const table = tableByHeading(document, 'VESSEL NAME');
  const { vessel } = info;
  [vessel.name, vessel.imo, vessel.callSign].forEach((value, index) => setCell(table, 1, index, value));
  [vessel.type, vessel.loa, vessel.breadth, vessel.gt, vessel.dwt, vessel.yearBuilt]
    .forEach((value, index) => setCell(table, 3, index, value));
  setCell(table, 5, 0, vessel.ownerClient);
  setCell(table, 5, 1, vessel.jobNo);
}

function fillOperationInfo(document: Document, info: ReportInfo): void {
  const table = tableByHeading(document, 'VESSEL SCHEDULE');
  const operation = info.operation;
  [operation.eta, operation.etd].forEach((value, index) => setCellLines(rowCells(table, 1)[index + 1], dateLines(value)));
  [operation.start, operation.end].forEach((value, index) => setCellLines(rowCells(table, 3)[index + 1], dateLines(value)));
  [operation.workWindow, operation.location].forEach((value, index) => setCell(table, 1, index + 3, value));
  [operation.workingTime, operation.position].forEach((value, index) => setCell(table, 3, index + 3, value));
  [`FWD / ${operation.draughtFwd}`, `MID / ${operation.draughtMid}`, `AFT / ${operation.draughtAft}`, operation.berthingSide]
    .forEach((value, index) => setCell(table, 5, index + 1, value.replace(/\s\/\s$/, '')));
  [operation.weather, operation.knots, operation.current, operation.visibility]
    .forEach((value, index) => setCell(table, 7, index + 1, value));
  setCell(table, 8, 1, operation.personnel);
}

function fillServiceItems(document: Document, info: ReportInfo): void {
  const table = tableByHeading(document, 'SERVICE CATEGORY');
  for (let row = 1; row <= 3; row += 1) {
    const service = info.serviceItems[row - 1] ?? '';
    setCell(table, row, 0, service);
    setCell(table, row, 1, service ? `${service} service` : '');
    setCell(table, row, 2, service ? 'Planned' : '');
  }
}

function fillReadiness(document: Document, info: ReportInfo): void {
  const toolbox = tableByHeading(document, 'TOOLBOX MEETING & LOTO');
  setCell(toolbox, 0, 1, info.readiness.toolboxTime);
  setCell(toolbox, 4, 1, info.readiness.toolboxNote);
  const preparation = tableByHeading(document, 'PREPARATION ON SITE');
  setCell(preparation, 0, 1, info.readiness.preparationTime);
  setCell(preparation, 4, 1, info.readiness.preparationNote);
}

async function fillReadinessPhotos(
  zip: JSZip,
  document: Document,
  info: ReportInfo,
  resizePhoto: NonNullable<Section14WriterDependencies['resizePhoto']>,
  onPhotoSkipped?: Section14WriterDependencies['onPhotoSkipped'],
): Promise<void> {
  const entry = zip.file('word/_rels/document.xml.rels');
  if (!entry) throw new Error('SECTION14_RELATIONSHIPS_MISSING');
  const relationships = new DOMParser().parseFromString(await entry.async('text'), 'application/xml');
  const groups = [
    ['TOOLBOX MEETING & LOTO', info.readiness.toolboxPhotos],
    ['PREPARATION ON SITE', info.readiness.preparationPhotos],
  ] as const;
  for (const [heading, slots] of groups) {
    const row = directChildren(tableByHeading(document, heading), 'tr')[2];
    const drawings = Array.from(row.getElementsByTagNameNS('*', 'drawing'));
    if (drawings.length !== 2) throw new Error(`SECTION14_PHOTO_SLOTS_INVALID:${heading}`);
    for (const [index, drawing] of drawings.entries()) {
      const blip = drawing.getElementsByTagNameNS('*', 'blip')[0];
      const id = blip?.getAttributeNS(RELATIONSHIP_NAMESPACE, 'embed');
      const relation = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship'))
        .find((item) => item.getAttribute('Id') === id);
      const target = relation?.getAttribute('Target');
      if (!target || !/^media\/[^/]+\.jpe?g$/i.test(target) || !zip.file(`word/${target}`)) {
        throw new Error(`SECTION14_PHOTO_RELATIONSHIP_INVALID:${id}`);
      }
      const extent = drawing.getElementsByTagNameNS('*', 'extent')[0];
      const width = Number(extent?.getAttribute('cx'));
      const height = Number(extent?.getAttribute('cy'));
      if (!(width > 0 && height > 0)) throw new Error('SECTION14_PHOTO_EXTENT_INVALID');
      const photo = slots[index];
      let bytes: Uint8Array = Uint8Array.from(atob(WHITE_JPEG), (character) => character.charCodeAt(0));
      if (photo) {
        try {
          bytes = await resizePhoto(photo, 1200, Math.round(1200 * height / width));
        } catch {
          onPhotoSkipped?.(photo.name);
        }
      }
      // Keep the original relationship, drawing and content type; replace its JPEG payload.
      zip.file(`word/${target}`, bytes, { createFolders: false });
    }
  }
}

function fillHeader(xml: string, reportInfo: ReportInfo): string {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('SECTION14_HEADER_INVALID');
  let changed = false;
  for (const paragraph of Array.from(document.getElementsByTagNameNS('*', 'p'))) {
    const value = textIn(paragraph);
    if (value.startsWith('Job No :')) {
      setElementTextPreservingRun(paragraph, `Job No : ${reportInfo.vessel.jobNo}`);
      changed = true;
    }
    if (value.startsWith('Vessel :')) {
      setElementTextPreservingRun(paragraph, `Vessel : ${reportInfo.vessel.name}`);
      changed = true;
    }
  }
  return changed ? new XMLSerializer().serializeToString(document) : xml;
}

export async function fillSection14Template(
  input: Section14ExportInput,
  dependencies: Section14WriterDependencies = {},
): Promise<Blob> {
  const fetchTemplate = dependencies.fetchTemplate ?? (async () => {
    const response = await fetch(input.templateUrl);
    if (!response.ok) throw new Error('SECTION14_TEMPLATE_LOAD_FAILED');
    return response.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(await fetchTemplate());
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) throw new Error('SECTION14_TEMPLATE_INVALID');
  const document = new DOMParser().parseFromString(await documentEntry.async('text'), 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('SECTION14_DOCUMENT_INVALID');
  fillGeneralInfo(document, input.reportInfo);
  fillOperationInfo(document, input.reportInfo);
  fillServiceItems(document, input.reportInfo);
  fillReadiness(document, input.reportInfo);
  await fillReadinessPhotos(zip, document, input.reportInfo, dependencies.resizePhoto ?? resizeForReportSlot, dependencies.onPhotoSkipped);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(document), { createFolders: false });
  const headers = Object.keys(zip.files).filter((path) => /^word\/header\d+\.xml$/.test(path));
  for (const path of headers) {
    const entry = zip.file(path);
    if (entry) zip.file(path, fillHeader(await entry.async('text'), input.reportInfo), { createFolders: false });
  }
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
