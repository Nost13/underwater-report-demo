import { describe, expect, it } from 'vitest';
import { setCellLines, setElementTextPreservingRun, setSeparatedRuns } from './ooxmlText';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const properties = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="18"/><w:lang w:eastAsia="ko-KR"/></w:rPr>';
const parse = (body: string) => new DOMParser().parseFromString(`<w:tc xmlns:w="${W}">${body}</w:tc>`, 'application/xml').documentElement;
const xml = (element: Element) => new XMLSerializer().serializeToString(element);
const runProperties = (element: Element) => Array.from(element.getElementsByTagNameNS(W, 'r')).map((run) => xml(run.getElementsByTagNameNS(W, 'rPr')[0]));

describe('template-preserving OOXML text', () => {
  it('replaces split text while retaining every existing run property and bookmark', () => {
    const cell = parse(`<w:p><w:bookmarkStart w:id="1" w:name="value"/><w:r>${properties}<w:t>Old</w:t></w:r><w:r>${properties}<w:t> value</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>`);
    const before = runProperties(cell);
    setElementTextPreservingRun(cell, ' New & value ');
    expect(cell.textContent).toBe(' New & value ');
    expect(cell.getElementsByTagNameNS(W, 't')[0].getAttribute('xml:space')).toBe('preserve');
    expect(runProperties(cell)).toEqual(before);
    expect(cell.getElementsByTagNameNS(W, 'bookmarkStart')).toHaveLength(1);
  });

  it('converts date paragraphs to one paragraph with one styled break and no trailing paragraph', () => {
    const cell = parse(`<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r>${properties}<w:t>date</w:t></w:r></w:p><w:p><w:r>${properties}<w:t>time</w:t></w:r></w:p><w:p/>`);
    const before = runProperties(cell);
    const paragraphProperties = xml(cell.getElementsByTagNameNS(W, 'pPr')[0]);
    setCellLines(cell, ['01 Sep 2026,', '01:36']);
    expect(cell.textContent).toBe('01 Sep 2026,01:36');
    expect(cell.getElementsByTagNameNS(W, 'p')).toHaveLength(1);
    expect(cell.getElementsByTagNameNS(W, 'br')).toHaveLength(1);
    expect(runProperties(cell).slice(0, before.length)).toEqual(before);
    expect(runProperties(cell).every((value) => value === before[0])).toBe(true);
    expect(xml(cell.getElementsByTagNameNS(W, 'pPr')[0])).toBe(paragraphProperties);
    setCellLines(cell, ['']);
    expect(cell.textContent).toBe('');
    expect(cell.getElementsByTagNameNS(W, 'br')).toHaveLength(0);
    expect(cell.getElementsByTagNameNS(W, 'p')).toHaveLength(1);
  });

  it('inherits paragraph mark font properties when an empty slot has no run', () => {
    const cell = parse(`<w:p><w:pPr>${properties}</w:pPr></w:p>`);
    setElementTextPreservingRun(cell, 'Filled');
    expect(cell.textContent).toBe('Filled');
    expect(runProperties(cell)[0]).toBe(xml(cell.getElementsByTagNameNS(W, 'pPr')[0].getElementsByTagNameNS(W, 'rPr')[0]));
  });

  it('adds a dedicated 1pt raised separator and inherits the caption font for new runs', () => {
    const cell = parse(`<w:p><w:r>${properties}<w:t>Sample</w:t></w:r></w:p>`);
    const paragraph = cell.getElementsByTagNameNS(W, 'p')[0];
    const original = runProperties(cell)[0];
    setSeparatedRuns(paragraph, ['ROPE REMOVAL', 'BEFORE']);
    expect(paragraph.textContent).toBe('ROPE REMOVAL | BEFORE');
    const runs = Array.from(paragraph.getElementsByTagNameNS(W, 'r'));
    const separator = runs.find((run) => run.textContent === ' | ')!;
    expect(separator.getElementsByTagNameNS(W, 'position')[0].getAttributeNS(W, 'val')).toBe('2');
    expect(separator.getElementsByTagNameNS(W, 't')[0].getAttribute('xml:space')).toBe('preserve');
    const separatorCopy = separator.cloneNode(true) as Element;
    separatorCopy.getElementsByTagNameNS(W, 'position')[0].remove();
    expect(xml(separatorCopy.getElementsByTagNameNS(W, 'rPr')[0])).toBe(original);
    expect(runProperties(cell)[0]).toBe(original);
    expect(runProperties(cell).at(-1)).toBe(original);
    setSeparatedRuns(paragraph, ['Base Caption', '']);
    expect(paragraph.textContent).toBe('Base Caption');
    expect(paragraph.getElementsByTagNameNS(W, 'position')).toHaveLength(0);
  });
});
