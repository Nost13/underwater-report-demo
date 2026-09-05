import JSZip from 'jszip';
import { linkedCoverValues, syncGeneratedCoverScope, type CoverInfo } from '../app/coverInfo';
import type { ReportInfo } from '../app/reportInfo';
import type { ReportSection } from '../domain/types';
import { COVER_PHOTO_SIZE, renderCoverPhoto } from '../browser/coverImage';

const WHITE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

export interface CoverWriterInput {
  coverInfo: CoverInfo;
  reportInfo: ReportInfo;
  sections: ReportSection[];
  templateUrl: string;
}
export interface CoverWriterDependencies {
  fetchTemplate?: () => Promise<ArrayBuffer | Uint8Array>;
  renderPhoto?: typeof renderCoverPhoto;
  onPhotoSkipped?: (fileName: string) => void;
}
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** These paragraph IDs were distilled from the retained cover. The two header
 * IDs occur twice: DrawingML and the original VML compatibility fallback. */
function patchParagraph(xml: string, id: string, value: string, skipTextNodes = 0, count = 1): string {
  let matches = 0;
  const output = xml.replace(new RegExp(`<w:p\\b[^>]*w14:paraId="${id}"[^>]*>[\\s\\S]*?</w:p>`, 'g'), (paragraph) => {
    matches += 1;
    let index = 0;
    const result = paragraph.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/g, (node, opening: string, closing: string) => {
      const current = index++;
      if (current < skipTextNodes) return node;
      if (current > skipTextNodes) return `${opening}${closing}`;
      return value.split(/\r\n|\r|\n/).map((line) => `${opening}${escapeText(line)}${closing}`).join('<w:br/>');
    });
    if (index <= skipTextNodes) throw new Error(`COVER_SLOT_TEXT_MISSING:${id}`);
    return result;
  });
  if (matches !== count) throw new Error(`COVER_SLOT_NOT_FOUND:${id}`);
  return output;
}

function heroPicture(xml: string) {
  const pictures = [...xml.matchAll(/<wp:anchor\b[^>]*>[\s\S]*?<\/wp:anchor>/g)]
    .map(([anchor]) => {
      if (!anchor.includes('uri="http://schemas.openxmlformats.org/drawingml/2006/picture"')) return null;
      const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(anchor);
      const relationship = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(anchor);
      if (!extent || !relationship) return null;
      const sourceCrop = /<a:srcRect\b[^>]*\/>/.exec(anchor)?.[0] ?? '';
      if (/\b[lr]="(?!0")/.test(sourceCrop)) throw new Error('COVER_UNSUPPORTED_HORIZONTAL_CROP');
      return {
        relationshipId: relationship[1], width: Number(extent[1]), height: Number(extent[2]),
        cropInsets: {
          top: Number(/\bt="(\d+)"/.exec(sourceCrop)?.[1] ?? 0) / 100000,
          bottom: Number(/\bb="(\d+)"/.exec(sourceCrop)?.[1] ?? 0) / 100000,
        },
      };
    }).filter((picture) => picture !== null).sort((a, b) => b.width * b.height - a.width * a.height);
  if (!pictures[0]) throw new Error('COVER_HERO_NOT_FOUND');
  return pictures[0];
}

export async function fillCoverTemplate(input: CoverWriterInput, dependencies: CoverWriterDependencies = {}): Promise<Blob> {
  const bytes = dependencies.fetchTemplate ? await dependencies.fetchTemplate() : await (async () => {
    const response = await fetch(input.templateUrl);
    if (!response.ok) throw new Error(`COVER_TEMPLATE_FETCH_FAILED:${response.status}`);
    return response.arrayBuffer();
  })();
  const zip = await JSZip.loadAsync(bytes);
  const originalXml = await zip.file('word/document.xml')?.async('text');
  const relationships = await zip.file('word/_rels/document.xml.rels')?.async('text');
  const contentTypes = await zip.file('[Content_Types].xml')?.async('text');
  if (!originalXml || !relationships || !contentTypes) throw new Error('COVER_TEMPLATE_PART_MISSING');
  const hero = heroPicture(originalXml);
  const relDocument = new DOMParser().parseFromString(relationships, 'application/xml');
  const relationship = Array.from(relDocument.getElementsByTagNameNS('*', 'Relationship')).find((rel) => rel.getAttribute('Id') === hero.relationshipId);
  const target = relationship?.getAttribute('Target') ?? '';
  if (!/^media\/[\w.-]+$/.test(target) || relationship?.getAttribute('TargetMode') === 'External' || !zip.file(`word/${target}`)) throw new Error('COVER_HERO_TARGET_MISSING');
  const values = linkedCoverValues(input.reportInfo);
  const scope = syncGeneratedCoverScope(input.coverInfo, input.sections);
  const issueDate = linkedCoverValues({ ...input.reportInfo, operation: { ...input.reportInfo.operation, start: input.coverInfo.issueDate, eta: '' } }).operationDate;
  let xml = patchParagraph(originalXml, '24C58190', ` ${values.reportNo}`, 2, 2);
  xml = patchParagraph(xml, '7E63896D', ` ${issueDate}`, 2, 2);
  const slots: Array<[string, string]> = [
    ['75F45E71', values.vesselName], ['268CAB18', values.imoNumber], ['7D8C7621', values.callSign],
    ['2C8FCF0C', values.ownerClient], ['118116C9', values.operationDate + (values.operationDate && values.location ? ' ,' : '')],
    ['7DCE8FF3', values.location], ['153C7F6D', scope.scopeTitle], ['769FEDD6', scope.scopeDescription],
  ];
  for (const [id, value] of slots) xml = patchParagraph(xml, id, value);
  let image: Uint8Array = Uint8Array.from(atob(WHITE_PNG), (character) => character.charCodeAt(0));
  if (input.coverInfo.photoFile) {
    try {
      image = await (dependencies.renderPhoto ?? renderCoverPhoto)(input.coverInfo.photoFile, input.coverInfo.crop, { ...COVER_PHOTO_SIZE, cropInsets: hero.cropInsets });
    } catch {
      dependencies.onPhotoSkipped?.(input.coverInfo.photoFile.name);
    }
  }
  zip.file('word/document.xml', xml, { createFolders: false });
  zip.file(`word/${target}`, image, { createFolders: false });
  // Renderer output is PNG. A per-part override retains the original JPEG path,
  // all relationship bytes, and the entire floating anchor including srcRect.
  zip.file('[Content_Types].xml', contentTypes.replace('</Types>', `<Override PartName="/word/${target}" ContentType="image/png"/></Types>`));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}
