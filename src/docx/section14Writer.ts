import JSZip from 'jszip';
import type { ReportInfo } from '../app/reportInfo';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface Section14ExportInput {
  reportInfo: ReportInfo;
  templateUrl: string;
}

interface WriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
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

function setText(element: Element, value: string): void {
  const textNodes = Array.from(element.getElementsByTagNameNS('*', 't'));
  if (!textNodes.length) {
    const paragraph = directChildren(element, 'p')[0] ?? element.appendChild(element.ownerDocument!.createElementNS(WORD_NAMESPACE, 'w:p'));
    const run = paragraph.appendChild(element.ownerDocument!.createElementNS(WORD_NAMESPACE, 'w:r'));
    const text = run.appendChild(element.ownerDocument!.createElementNS(WORD_NAMESPACE, 'w:t'));
    text.textContent = value;
    return;
  }
  textNodes[0].textContent = value;
  for (let index = 1; index < textNodes.length; index += 1) textNodes[index].textContent = '';
}

function setCell(table: Element, row: number, cell: number, value: string): void {
  const target = rowCells(table, row)[cell];
  if (!target) throw new Error(`SECTION14_CELL_NOT_FOUND:${row}:${cell}`);
  setText(target, value);
}

function documentJobNo(value: string): string {
  return value.toUpperCase();
}

function fillGeneralInfo(document: Document, info: ReportInfo): void {
  const table = tableByHeading(document, 'VESSEL NAME');
  const { vessel } = info;
  [vessel.name, vessel.imo, vessel.callSign].forEach((value, index) => setCell(table, 1, index, value));
  [vessel.type, vessel.loa, vessel.breadth, vessel.gt, vessel.dwt, vessel.yearBuilt]
    .forEach((value, index) => setCell(table, 3, index, value));
  setCell(table, 5, 0, vessel.ownerClient);
  setCell(table, 5, 1, documentJobNo(vessel.jobNo));
}

function fillOperationInfo(document: Document, info: ReportInfo): void {
  const table = tableByHeading(document, 'VESSEL SCHEDULE');
  const operation = info.operation;
  [operation.eta, operation.etd, operation.workWindow, operation.location]
    .forEach((value, index) => setCell(table, 1, index + 1, value));
  [operation.start, operation.end, operation.workingTime, operation.position]
    .forEach((value, index) => setCell(table, 3, index + 1, value));
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

function fillHeader(xml: string, reportInfo: ReportInfo): string {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('SECTION14_HEADER_INVALID');
  for (const paragraph of Array.from(document.getElementsByTagNameNS('*', 'p'))) {
    const value = textIn(paragraph);
    if (value.startsWith('Job No :')) setText(paragraph, `Job No : ${documentJobNo(reportInfo.vessel.jobNo)}`);
    if (value.startsWith('Vessel :')) setText(paragraph, `Vessel : ${reportInfo.vessel.name}`);
  }
  return new XMLSerializer().serializeToString(document);
}

export async function fillSection14Template(
  input: Section14ExportInput,
  dependencies: WriterDependencies = {},
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
  zip.file('word/document.xml', new XMLSerializer().serializeToString(document));
  const headers = Object.keys(zip.files).filter((path) => /^word\/header\d+\.xml$/.test(path));
  for (const path of headers) {
    const entry = zip.file(path);
    if (entry) zip.file(path, fillHeader(await entry.async('text'), input.reportInfo));
  }
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
