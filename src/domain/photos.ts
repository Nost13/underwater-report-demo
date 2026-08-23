import type { Phase, PhotoData, ReportSection, ServiceKind } from './types';

const normalize = (value: string) => value.trim().toUpperCase();
const SERVICE_TOKENS: ServiceKind[] = [
  'INSPECTION',
  'CLEANING',
  'POLISHING',
  'REPAIR',
  'REMOVAL',
];

export function sectionDirectorySegments(section: ReportSection): string[] {
  return [
    section.area,
    section.component,
    section.side,
    section.unit ? String(section.unit).padStart(2, '0') : undefined,
  ].filter((segment): segment is string => Boolean(segment));
}

export function matchPhotoPath(
  relativePath: string,
  sections: ReportSection[],
): { sectionId: string; phase: Phase } | null {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean).map(normalize);
  if (segments.length < 3) return null;
  const directorySegments = segments.slice(0, -1);
  const phaseToken = directorySegments.at(-1) as Phase | undefined;
  if (!phaseToken || !['CURRENT', 'BEFORE', 'AFTER'].includes(phaseToken)) return null;
  const hierarchy = directorySegments.slice(0, -1);
  const serviceToken = SERVICE_TOKENS.includes(hierarchy[0] as ServiceKind)
    ? hierarchy[0] as ServiceKind
    : null;
  const physicalHierarchy = serviceToken ? hierarchy.slice(1) : hierarchy;
  const candidates = sections.filter((section) => {
    const expected = sectionDirectorySegments(section).map(normalize);
    return (
      section.phases.includes(phaseToken) &&
      (!serviceToken || section.service === serviceToken) &&
      expected.length === physicalHierarchy.length &&
      expected.every((segment, index) => segment === physicalHierarchy[index])
    );
  });
  return candidates.length === 1 ? { sectionId: candidates[0].id, phase: phaseToken } : null;
}

export function createCaption(
  photo: PhotoData,
  section: ReportSection,
  phaseIndex: number,
): string {
  return [
    section.component,
    section.side,
    section.unit ? `UNIT ${String(section.unit).padStart(2, '0')}` : undefined,
    photo.phase,
    String(phaseIndex).padStart(2, '0'),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function phaseIndexForPhoto(photo: PhotoData, photos: PhotoData[]): number {
  const phasePhotos = photos
    .filter((candidate) => (
      candidate.reportUse &&
      candidate.sectionId === photo.sectionId &&
      candidate.phase === photo.phase
    ))
    .sort((a, b) => a.order - b.order);
  const index = phasePhotos.findIndex((candidate) => candidate.id === photo.id);
  return index >= 0 ? index + 1 : 1;
}
