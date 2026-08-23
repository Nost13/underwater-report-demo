import type { PhotoData } from './types';

export interface ReportPage {
  index: number;
  photos: PhotoData[];
}

export const pageCount = (count: number): number =>
  count <= 0 ? 0 : count <= 4 ? 1 : 1 + Math.ceil((count - 4) / 6);

export function paginateSection(sectionId: string, photos: PhotoData[]): ReportPage[] {
  const active = photos
    .filter((photo) => photo.sectionId === sectionId && photo.reportUse)
    .sort((left, right) => left.order - right.order);
  const pages: ReportPage[] = [];
  const phaseOrder = ['BEFORE', 'AFTER', 'CURRENT'] as const;
  for (const phase of phaseOrder) {
    const phasePhotos = active.filter((photo) => photo.phase === phase);
    let start = 0;
    while (start < phasePhotos.length) {
      const capacity = pages.length === 0 ? 4 : 6;
      pages.push({ index: pages.length, photos: phasePhotos.slice(start, start + capacity) });
      start += capacity;
    }
  }
  return pages;
}
