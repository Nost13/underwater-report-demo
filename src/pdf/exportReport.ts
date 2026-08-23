import { jsPDF } from 'jspdf';
import { resizeForPdf } from '../browser/images';
import { createCaption, phaseIndexForPhoto } from '../domain/photos';
import { formatConditionSummary } from '../domain/conditions';
import { paginateSection } from '../domain/pagination';
import type { PhotoData, ReportSection } from '../domain/types';

interface PdfWriter {
  addPage(format?: string, orientation?: string): void;
  setFillColor(r: number, g: number, b: number): void;
  rect(x: number, y: number, width: number, height: number, style?: string): void;
  setTextColor(r: number, g: number, b: number): void;
  setFontSize(size: number): void;
  setFont(name: string, style?: string): void;
  text(text: string, x: number, y: number, options?: Record<string, unknown>): void;
  addImage(
    data: Uint8Array,
    format: string,
    x: number,
    y: number,
    width: number,
    height: number,
    alias?: string,
    compression?: string,
  ): void;
  save(fileName: string): void;
}

export interface ExportInput {
  vesselName: string;
  sections: ReportSection[];
  photos: PhotoData[];
  fileName?: string;
}

interface ExportDependencies {
  resize: (file: File, maxEdge?: number) => Promise<Uint8Array>;
  createPdf: () => PdfWriter;
}

const defaultDependencies: ExportDependencies = {
  resize: resizeForPdf,
  createPdf: () => new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as PdfWriter,
};

interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
}

function slotsFor(count: number): Slot[] {
  const columns = count <= 4 ? 2 : 3;
  const rows = 2;
  const pageWidth = 297;
  const left = 12;
  const right = 12;
  const top = 37;
  const bottom = 26;
  const gap = 5;
  const width = (pageWidth - left - right - gap * (columns - 1)) / columns;
  const height = (210 - top - bottom - gap) / rows;
  return Array.from({ length: columns * rows }, (_, index) => ({
    x: left + (index % columns) * (width + gap),
    y: top + Math.floor(index / columns) * (height + gap),
    width,
    height,
  }));
}

function drawHeader(
  pdf: PdfWriter,
  input: ExportInput,
  section: ReportSection,
  pageNumber: number,
) {
  pdf.setFillColor(12, 37, 50);
  pdf.rect(0, 0, 297, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('UNDERWATER SERVICE REPORT', 12, 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`${input.vesselName}  |  ${section.service}`, 12, 19);
  pdf.text(section.id, 204, 12);
  pdf.text(`PAGE ${pageNumber}`, 272, 19);
}

function drawFooter(pdf: PdfWriter, section: ReportSection) {
  pdf.setFillColor(242, 246, 247);
  pdf.rect(0, 190, 297, 20, 'F');
  pdf.setTextColor(48, 72, 81);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('CONDITION BY PHASE', 12, 198);
  pdf.setFont('helvetica', 'normal');
  const value = section.phases.map((phase) => {
    const condition = section.conditions[phase];
    return `${phase}: ${formatConditionSummary(condition)}`;
  }).join('     ');
  pdf.text(value, 12, 204);
}

export async function exportReportPdf(
  input: ExportInput,
  dependencies: ExportDependencies = defaultDependencies,
): Promise<{ skipped: string[] }> {
  const pdf = dependencies.createPdf();
  const skipped: string[] = [];
  const reportPages = input.sections.flatMap((section) =>
    paginateSection(section.id, input.photos).map((page) => ({ section, page })),
  );

  if (reportPages.length === 0) {
    const fallback = input.sections[0];
    if (fallback) {
      drawHeader(pdf, input, fallback, 1);
      pdf.setTextColor(80, 101, 110);
      pdf.setFontSize(12);
      pdf.text('No Report Use photos.', 118, 104);
      drawFooter(pdf, fallback);
    }
  }

  for (let pageIndex = 0; pageIndex < reportPages.length; pageIndex += 1) {
    const { section, page } = reportPages[pageIndex];
    if (pageIndex > 0) pdf.addPage('a4', 'landscape');
    drawHeader(pdf, input, section, pageIndex + 1);
    const slots = slotsFor(page.photos.length);
    for (let photoIndex = 0; photoIndex < page.photos.length; photoIndex += 1) {
      const photo = page.photos[photoIndex];
      const slot = slots[photoIndex];
      const phase = photo.phase ?? 'CURRENT';
      try {
        const bytes = await dependencies.resize(photo.file, 1800);
        const captionHeight = 9;
        pdf.addImage(bytes, 'JPEG', slot.x, slot.y, slot.width, slot.height - captionHeight, undefined, 'FAST');
        pdf.setFillColor(255, 255, 255);
        pdf.rect(slot.x, slot.y + slot.height - captionHeight, slot.width, captionHeight, 'F');
        pdf.setTextColor(30, 51, 60);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.text(createCaption(photo, section, phaseIndexForPhoto(photo, input.photos)), slot.x + 2, slot.y + slot.height - 3.5);
        const badgeColor: [number, number, number] = phase === 'AFTER'
          ? [15, 118, 110]
          : phase === 'CURRENT' ? [37, 99, 163] : [12, 37, 50];
        pdf.setFillColor(...badgeColor);
        pdf.rect(slot.x + 2, slot.y + 2, 20, 7, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6);
        pdf.text(phase, slot.x + 4, slot.y + 6.5);
      } catch {
        skipped.push(photo.file.name);
        pdf.setFillColor(231, 236, 238);
        pdf.rect(slot.x, slot.y, slot.width, slot.height, 'F');
        pdf.setTextColor(121, 137, 144);
        pdf.setFontSize(8);
        pdf.text(`IMAGE SKIPPED: ${photo.file.name}`, slot.x + 4, slot.y + slot.height / 2);
      }
    }
    drawFooter(pdf, section);
  }

  const services = [...new Set(input.sections.map((section) => section.service))];
  const serviceLabel = services.length === 1 ? services[0] : 'MULTI_SERVICE';
  const safeName = input.fileName ?? `${input.vesselName.replace(/[^a-z0-9]+/gi, '_')}_${serviceLabel}.pdf`;
  pdf.save(safeName);
  return { skipped };
}
