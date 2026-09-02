import JSZip from 'jszip';
import { buildSummaryModel, MAIN_HULL_ORDER, type SummaryRow } from '../summary/summaryModel';
import type { ReportSection } from '../domain/types';
import { RATING_FILLS } from './ratingPalette';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface SummaryWriterInput {
  sections: ReportSection[];
  templateUrl: string;
}

interface SummaryWriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
}

const elementText = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const directChildren = (element: Element, localName: string) => (
  Array.from(element.children).filter((child) => child.localName === localName)
);
const closestElement = (element: Element | null, localName: string): Element | null => {
  let current = element;
  while (current && current.localName !== localName) current = current.parentElement;
  return current;
};
const directCells = (row: Element) => directChildren(row, 'tc');

function topLevelTables(document: Document): Element[] {
  return Array.from(document.getElementsByTagNameNS('*', 'tbl'))
    .filter((table) => !closestElement(table.parentElement, 'tbl'));
}

function setCellText(cell: Element, value: string, referenceCell?: Element): void {
  const textNodes = Array.from(cell.getElementsByTagNameNS('*', 't'));
  if (textNodes.length) {
    textNodes[0].textContent = value;
    textNodes.slice(1).forEach((node) => { node.textContent = ''; });
    return;
  }
  const paragraph = Array.from(cell.getElementsByTagNameNS('*', 'p'))[0];
  if (!paragraph) return;
  const referenceRun = referenceCell
    ? Array.from(referenceCell.getElementsByTagNameNS('*', 'r'))[0]
    : undefined;
  const run = referenceRun
    ? referenceRun.cloneNode(true) as Element
    : cell.ownerDocument.createElementNS(WORD_NAMESPACE, 'w:r');
  Array.from(run.children)
    .filter((child) => child.localName !== 'rPr')
    .forEach((child) => child.remove());
  const text = cell.ownerDocument.createElementNS(WORD_NAMESPACE, 'w:t');
  text.textContent = value;
  run.appendChild(text);
  paragraph.appendChild(run);
}

function setCellShading(cell: Element, fill?: string): void {
  const nestedCells = Array.from(cell.getElementsByTagNameNS('*', 'tc'));
  const target = nestedCells.at(-1) ?? cell;
  let properties = directChildren(target, 'tcPr')[0];
  if (!properties) {
    properties = target.ownerDocument.createElementNS(WORD_NAMESPACE, 'w:tcPr');
    target.insertBefore(properties, target.firstChild);
  }
  let shading = directChildren(properties, 'shd')[0];
  if (!fill) {
    shading?.remove();
    return;
  }
  if (!shading) {
    shading = target.ownerDocument.createElementNS(WORD_NAMESPACE, 'w:shd');
    properties.appendChild(shading);
  }
  shading.setAttributeNS(WORD_NAMESPACE, 'w:val', 'clear');
  shading.setAttributeNS(WORD_NAMESPACE, 'w:color', 'auto');
  shading.setAttributeNS(WORD_NAMESPACE, 'w:fill', fill);
}

function setRatingCell(cell: Element, rating: string, referenceCell?: Element): void {
  setCellText(cell, rating, referenceCell);
  setCellShading(cell, RATING_FILLS[rating]);
}

function fillConditionCells(cells: Element[], row?: SummaryRow): void {
  const values = row ?? {
    foulingRating: '', foulingType: '', coverage: '',
    observedRating: '', observedLevel: '', observedType: '',
  };
  setRatingCell(cells[2], values.foulingRating, cells[5]);
  setCellText(cells[3], values.foulingType, cells[6]);
  setCellText(cells[4], values.coverage, cells[3]);
  setRatingCell(cells[5], values.observedRating, cells[2]);
  setCellText(cells[6], values.observedLevel, cells[3]);
  setCellText(cells[7], values.observedType, cells[6]);
  if (cells[8]) setCellText(cells[8], '', cells[7]);
}

function fillOverviewTable(document: Document, rows: SummaryRow[]): void {
  const table = topLevelTables(document).find((candidate) => {
    const first = directChildren(candidate, 'tr')[0];
    const cells = first ? directCells(first) : [];
    return cells.length === 8 && cells.filter((cell) => elementText(cell) === 'Component').length === 2;
  });
  if (!table) throw new Error('SUMMARY_OVERVIEW_TABLE_NOT_FOUND');
  const byComponent = new Map(rows.map((row) => [row.component.toUpperCase(), row]));
  for (const row of directChildren(table, 'tr').slice(1)) {
    const cells = directCells(row);
    for (const offset of [0, 4]) {
      const record = byComponent.get(elementText(cells[offset]).toUpperCase());
      setRatingCell(cells[offset + 1], record?.foulingRating ?? '', cells[offset + 1]);
      setCellText(cells[offset + 2], record?.foulingType ?? '', cells[offset + 2]);
      setCellText(cells[offset + 3], record?.coverage ?? '', cells[offset + 3]);
    }
  }
}

function zoneFromTable(table: Element): string | null {
  const match = elementText(table).match(/MAIN HULL SURFACES\s*\/\s*(FWD-MID|MID-AFT|FWD|MID|AFT)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function fillMainHullTables(document: Document, rows: SummaryRow[]): void {
  const byKey = new Map(rows.map((row) => [`${row.sourceComponent}/${row.side}`, row]));
  for (const table of topLevelTables(document)) {
    const zone = zoneFromTable(table);
    if (!zone) continue;
    for (const tableRow of directChildren(table, 'tr').slice(3)) {
      const cells = directCells(tableRow);
      if (cells.length < 8) continue;
      const side = elementText(cells[1]).toUpperCase()
        || (elementText(cells[0]).toUpperCase() === 'BOTTOM' ? 'BOTTOM' : '');
      fillConditionCells(cells, byKey.get(`${zone}/${side}`));
    }
  }
}

function fillNicheTable(document: Document, rows: SummaryRow[]): void {
  const table = topLevelTables(document).find((candidate) => (
    elementText(candidate).startsWith('NICHE AREAS & COMPONENTS')
    && directChildren(candidate, 'tr').some((row) => directCells(row).length >= 9)
  ));
  if (!table) throw new Error('SUMMARY_NICHE_TABLE_NOT_FOUND');
  const tableRows = directChildren(table, 'tr');
  if (!tableRows[3]) throw new Error('SUMMARY_NICHE_ROW_NOT_FOUND');
  const byComponentAndSide = new Map(rows.map((row) => [
    `${row.component.toUpperCase()}/${row.side ?? ''}`,
    row,
  ]));
  let component = '';
  for (const row of tableRows.slice(3)) {
    const cells = directCells(row);
    if (cells.length < 9) continue;
    component = elementText(cells[0]) || component;
    const side = elementText(cells[1]).toUpperCase();
    fillConditionCells(cells, byComponentAndSide.get(`${component.toUpperCase()}/${side}`));
  }
}

function fillOverallResult(document: Document, headline: string, narrative: string): void {
  const table = topLevelTables(document)[0];
  const rows = table ? directChildren(table, 'tr') : [];
  if (rows.length < 2) throw new Error('SUMMARY_RESULT_TABLE_NOT_FOUND');
  setCellText(directCells(rows[0])[0], headline);
  setCellText(directCells(rows[1])[0], narrative);
}

function overviewCategory(text: string): string | null {
  const compact = text.toUpperCase().replace(/\s+/g, '');
  if (compact.includes('FWD-MID') || compact.includes('MID-FWD')) return 'FWD-MID';
  if (compact.includes('MID-AFT') || compact.includes('AFT-MID')) return 'MID-AFT';
  return MAIN_HULL_ORDER.find((zone) => compact.includes(zone)) ?? null;
}

function patchOverviewDiagram(document: Document, rows: SummaryRow[]): void {
  const ratings = new Map(rows.map((row) => [`${row.side}/${row.sourceComponent}`, row.foulingRating]));
  let lastLayer = '';
  for (const textBox of Array.from(document.getElementsByTagNameNS('*', 'txbxContent'))) {
    const raw = elementText(textBox);
    if (!/Rating/i.test(raw)) continue;
    const zone = overviewCategory(raw);
    if (!zone) continue;
    const drawing = closestElement(textBox, 'drawing');
    const position = drawing ? Array.from(drawing.getElementsByTagNameNS('*', 'posOffset')).at(-1) : undefined;
    const offset = Number.parseInt(position?.textContent ?? '', 10);
    const layer = Number.isFinite(offset) ? (offset < 800_000 ? 'STBD' : offset < 1_700_000 ? 'BOTTOM' : 'PORT') : lastLayer;
    if (!layer) continue;
    lastLayer = layer;
    const rating = ratings.get(`${layer}/${zone}`) ?? '';
    const display = rating || '-';
    const textNode = Array.from(textBox.getElementsByTagNameNS('*', 't')).find((node) => /Rating/i.test(node.textContent ?? ''));
    if (textNode) textNode.textContent = (textNode.textContent ?? '').replace(/(Rating\s*)[0-5-]*/i, `$1${display}`);
    for (const border of Array.from(textBox.getElementsByTagNameNS('*', 'left'))) {
      border.setAttributeNS(WORD_NAMESPACE, 'w:color', RATING_FILLS[rating] ?? 'D9D9D9');
    }
  }
}

function hasExplicitPageBreak(element: Element): boolean {
  return Array.from(element.getElementsByTagNameNS('*', 'br'))
    .some((br) => br.getAttributeNS(WORD_NAMESPACE, 'type') === 'page');
}

function isBreakOnly(element: Element): boolean {
  return hasExplicitPageBreak(element) && !elementText(element);
}

function pruneSummaryPages(document: Document, keepMainHull: boolean, keepNiche: boolean): void {
  const body = Array.from(document.getElementsByTagNameNS('*', 'body'))[0];
  if (!body) throw new Error('SUMMARY_BODY_NOT_FOUND');
  const sectionProperties = directChildren(body, 'sectPr')[0];
  const children = Array.from(body.children).filter((child) => child !== sectionProperties);
  const pages: Element[][] = [];
  let current: Element[] = [];
  for (const child of children) {
    current.push(child);
    if (hasExplicitPageBreak(child)) {
      pages.push(current);
      current = [];
    }
  }
  if (current.length) pages.push(current);
  const selected = pages.filter((page, index) => {
    if (index === 0) return true;
    const text = elementText({ textContent: page.map((element) => element.textContent).join(' ') } as Element);
    if (/MAIN HULL SURFACES/i.test(text)) return keepMainHull;
    if (/NICHE AREAS & COMPONENTS/i.test(text)) return keepNiche;
    return true;
  });
  Array.from(body.children).filter((child) => child !== sectionProperties).forEach((child) => child.remove());
  selected.forEach((page, pageIndex) => {
    const elements = [...page];
    if (pageIndex === selected.length - 1) while (elements.length && isBreakOnly(elements.at(-1)!)) elements.pop();
    for (const element of elements) {
      Array.from(element.getElementsByTagNameNS('*', 'lastRenderedPageBreak')).forEach((node) => node.remove());
      body.insertBefore(element, sectionProperties ?? null);
    }
  });
  if (!keepMainHull && keepNiche) {
    for (const paragraph of Array.from(document.getElementsByTagNameNS('*', 'p'))) {
      if (/OVERALL FINDINGS MATRIX\s*\(CONTINUED\)/i.test(elementText(paragraph))) {
        const nodes = Array.from(paragraph.getElementsByTagNameNS('*', 't'));
        const replacement = nodes.map((node) => node.textContent ?? '').join('')
          .replace(/\s*\(CONTINUED\)/i, '');
        if (nodes[0]) nodes[0].textContent = replacement;
        nodes.slice(1).forEach((node) => { node.textContent = ''; });
      }
    }
  }
}

function enableFieldUpdates(zip: JSZip): Promise<void> {
  return (async () => {
    const entry = zip.file('word/settings.xml');
    if (!entry) return;
    let xml = await entry.async('text');
    if (/<w:updateFields\b/.test(xml)) {
      xml = xml.replace(/<w:updateFields\b[^>]*\/?\s*>/, '<w:updateFields w:val="true"/>');
    } else {
      xml = xml.replace('</w:settings>', '<w:updateFields w:val="true"/></w:settings>');
    }
    zip.file('word/settings.xml', xml);
  })();
}

function ensureSummaryBookmark(document: Document, heading: string, bookmarkName: string): void {
  const normalizedHeading = heading.toUpperCase().replace(/\s+/g, '');
  const paragraph = Array.from(document.getElementsByTagNameNS('*', 'p')).find((candidate) => (
    elementText(candidate).toUpperCase().replace(/\s+/g, '').startsWith(normalizedHeading)
  ));
  if (!paragraph) throw new Error(`SUMMARY_BOOKMARK_HEADING_NOT_FOUND:${heading}`);
  const existing = Array.from(paragraph.getElementsByTagNameNS('*', 'bookmarkStart'))[0];
  if (existing) {
    existing.setAttributeNS(WORD_NAMESPACE, 'w:name', bookmarkName);
    return;
  }
  const nextId = Array.from(document.getElementsByTagNameNS('*', 'bookmarkStart')).reduce((highest, bookmark) => {
    const id = Number.parseInt(bookmark.getAttributeNS(WORD_NAMESPACE, 'id') ?? '', 10);
    return Number.isFinite(id) ? Math.max(highest, id) : highest;
  }, 0) + 1;
  const start = document.createElementNS(WORD_NAMESPACE, 'w:bookmarkStart');
  start.setAttributeNS(WORD_NAMESPACE, 'w:id', String(nextId));
  start.setAttributeNS(WORD_NAMESPACE, 'w:name', bookmarkName);
  const end = document.createElementNS(WORD_NAMESPACE, 'w:bookmarkEnd');
  end.setAttributeNS(WORD_NAMESPACE, 'w:id', String(nextId));
  const firstContent = Array.from(paragraph.children).find((child) => child.localName !== 'pPr');
  paragraph.insertBefore(start, firstContent ?? null);
  paragraph.appendChild(end);
}

function compactSummaryLeadPage(document: Document): void {
  const body = Array.from(document.getElementsByTagNameNS('*', 'body'))[0];
  if (!body) throw new Error('SUMMARY_BODY_NOT_FOUND');
  const children = Array.from(body.children);
  const overallResultIndex = children.findIndex((element) => elementText(element).startsWith('5.1 OVERALL RESULT'));
  const overviewIndex = children.findIndex((element) => elementText(element).startsWith('5.2 BIO'));
  if (overallResultIndex < 0 || overviewIndex <= overallResultIndex) return;
  children.slice(overallResultIndex + 1, overviewIndex).forEach((element) => {
    if (element.localName === 'p' && !elementText(element) && !hasExplicitPageBreak(element)) element.remove();
  });
}

export async function fillSummaryTemplate(
  input: SummaryWriterInput,
  dependencies: SummaryWriterDependencies = {},
): Promise<Blob> {
  const fetchTemplate = dependencies.fetchTemplate ?? (async () => {
    const response = await fetch(input.templateUrl);
    if (!response.ok) throw new Error('SUMMARY_TEMPLATE_LOAD_FAILED');
    return response.arrayBuffer();
  });
  const zip = await JSZip.loadAsync(await fetchTemplate());
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) throw new Error('SUMMARY_TEMPLATE_INVALID');
  const document = new DOMParser().parseFromString(await documentEntry.async('text'), 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('SUMMARY_TEMPLATE_XML_INVALID');
  const model = buildSummaryModel(input.sections);
  fillOverallResult(document, model.headline, model.narrative);
  fillOverviewTable(document, model.overviewRows);
  fillMainHullTables(document, model.mainHullRows);
  fillNicheTable(document, model.nicheRows);
  patchOverviewDiagram(document, model.mainHullRows);
  pruneSummaryPages(document, model.mainHullRows.length > 0, model.nicheRows.length > 0);
  compactSummaryLeadPage(document);
  ensureSummaryBookmark(document, '5.1 OVERALL RESULT', '_Toc233757656');
  ensureSummaryBookmark(document, '5.2 BIO FOULING CONDITION OVERVIEW', '_Toc233757657');
  ensureSummaryBookmark(document, '5.3 OVERALL FINDINGS MATRIX', '_Toc233757658');
  zip.file('word/document.xml', new XMLSerializer().serializeToString(document));
  await enableFieldUpdates(zip);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
