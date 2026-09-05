const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => child.namespaceURI === WORD_NS && child.localName === name);
}

function firstParagraph(element: Element): Element {
  return element.localName === 'p' ? element
    : children(element, 'p')[0] ?? element.appendChild(element.ownerDocument.createElementNS(WORD_NS, 'w:p'));
}

function firstRunProperties(element: Element): Element | undefined {
  const run = element.getElementsByTagNameNS(WORD_NS, 'r')[0];
  return (run && children(run, 'rPr')[0])
    ?? children(firstParagraph(element), 'pPr')[0]?.getElementsByTagNameNS(WORD_NS, 'rPr')[0];
}

function newRun(paragraph: Element, properties?: Element): Element {
  const run = paragraph.ownerDocument.createElementNS(WORD_NS, 'w:r');
  if (properties) run.appendChild(properties.cloneNode(true));
  return run;
}

function appendText(run: Element, value: string): Element {
  const text = run.appendChild(run.ownerDocument.createElementNS(WORD_NS, 'w:t'));
  text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  text.textContent = value;
  return text;
}

/** Patch text nodes in place, leaving the template's runs and formatting intact. */
export function setElementTextPreservingRun(element: Element, value: string): void {
  const texts = Array.from(element.getElementsByTagNameNS(WORD_NS, 't'));
  if (!texts.length) {
    const paragraph = firstParagraph(element);
    const run = newRun(paragraph, firstRunProperties(element));
    appendText(run, value);
    paragraph.appendChild(run);
    return;
  }
  texts[0].textContent = value;
  texts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
  texts.slice(1).forEach((text) => { text.textContent = ''; });
}

/** Keep one cell paragraph and its original runs, adding styled Word line breaks. */
export function setCellLines(cell: Element, lines: readonly string[]): void {
  const paragraph = firstParagraph(cell);
  const properties = firstRunProperties(cell);
  for (const extra of children(cell, 'p').slice(1)) {
    // Retain the original value runs/bookmarks while removing paragraph boundaries.
    for (const node of Array.from(extra.childNodes)) {
      if (node.nodeType !== 1 || (node as Element).localName !== 'pPr') paragraph.appendChild(node);
    }
    extra.remove();
  }
  Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 'br')).forEach((node) => node.remove());
  setElementTextPreservingRun(paragraph, lines[0] ?? '');
  for (const line of lines.slice(1)) {
    const run = newRun(paragraph, properties);
    run.appendChild(paragraph.ownerDocument.createElementNS(WORD_NS, 'w:br'));
    appendText(run, line);
    paragraph.appendChild(run);
  }
}

/** Compose caption/work labels using the source font and a dedicated raised separator. */
export function setSeparatedRuns(paragraph: Element, parts: readonly string[]): void {
  const properties = firstRunProperties(paragraph)?.cloneNode(true) as Element | undefined;
  const existingRuns = children(paragraph, 'r');
  const insertionPoint = existingRuns[0] ?? null;
  const values = parts.filter((part) => part.trim().length > 0);
  values.forEach((value, index) => {
    if (index) {
      const separator = newRun(paragraph, properties);
      const runProperties = children(separator, 'rPr')[0]
        ?? separator.appendChild(paragraph.ownerDocument.createElementNS(WORD_NS, 'w:rPr'));
      children(runProperties, 'position').forEach((node) => node.remove());
      const position = runProperties.appendChild(paragraph.ownerDocument.createElementNS(WORD_NS, 'w:position'));
      position.setAttributeNS(WORD_NS, 'w:val', '2');
      appendText(separator, ' | ');
      paragraph.insertBefore(separator, insertionPoint);
    }
    const run = newRun(paragraph, properties);
    appendText(run, value);
    paragraph.insertBefore(run, insertionPoint);
  });
  existingRuns.forEach((run) => run.remove());
}
