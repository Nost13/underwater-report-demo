import { sectionDirectorySegments } from '../domain/photos';
import type { Phase, ReportSection } from '../domain/types';

const SERVICE_SEGMENTS = new Set([
  'INSPECTION',
  'CLEANING',
  'POLISHING',
  'REPAIR',
  'REMOVAL',
]);

export interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export interface DirectoryHandleLike {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  entries(): AsyncIterableIterator<[string, DirectoryHandleLike | FileHandleLike]>;
}

export interface ScannedImage {
  file: File;
  relativePath: string;
}

export function folderRelativePath(value: string): string {
  const segments = value.split(/[\\/]+/).filter(Boolean);
  const reportRoot = segments.findIndex((segment) => ['GENERAL', 'NICHE'].includes(segment.toUpperCase()));
  if (reportRoot < 0) return segments.join('/');
  const serviceRoot = reportRoot > 0 && SERVICE_SEGMENTS.has(segments[reportRoot - 1].toUpperCase())
    ? reportRoot - 1
    : reportRoot;
  return (serviceRoot > 0 ? segments.slice(serviceRoot) : segments).join('/');
}

export function needsServiceDirectory(
  section: ReportSection,
  sections: ReportSection[],
): boolean {
  return sections.some((candidate) => (
    candidate.id !== section.id &&
    candidate.targetId === section.targetId &&
    candidate.phases.some((phase) => section.phases.includes(phase))
  ));
}

export function directorySegments(
  section: ReportSection,
  phase: Phase,
  sections: ReportSection[] = [section],
): string[] {
  return [
    needsServiceDirectory(section, sections) ? section.service : undefined,
    ...sectionDirectorySegments(section),
    phase,
  ].filter((segment): segment is string => Boolean(segment));
}

export async function createSectionTree(
  root: DirectoryHandleLike,
  sections: ReportSection[],
): Promise<void> {
  for (const section of sections) {
    for (const phase of section.phases) {
      let cursor = root;
      for (const segment of directorySegments(section, phase, sections)) {
        cursor = await cursor.getDirectoryHandle(segment, { create: true });
      }
    }
  }
}

const isImage = (file: File) =>
  file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(file.name);

export async function scanImages(root: DirectoryHandleLike): Promise<ScannedImage[]> {
  const images: ScannedImage[] = [];

  async function visit(directory: DirectoryHandleLike, prefix: string) {
    for await (const [name, handle] of directory.entries()) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        await visit(handle, relativePath);
      } else {
        const file = await handle.getFile();
        if (isImage(file)) images.push({ file, relativePath });
      }
    }
  }

  await visit(root, '');
  return images.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function pickDirectory(mode: 'read' | 'readwrite'): Promise<DirectoryHandleLike> {
  const picker = (
    globalThis as typeof globalThis & {
      showDirectoryPicker?: (options: { mode: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
    }
  ).showDirectoryPicker;
  if (!picker) throw new Error('FILE_SYSTEM_ACCESS_UNAVAILABLE');
  return picker({ mode });
}
