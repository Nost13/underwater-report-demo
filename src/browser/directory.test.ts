import { describe, expect, it } from 'vitest';
import {
  createGeneralTargets,
  createNicheSections,
  createReportSections,
} from '../domain/structure';
import { createSectionTree, directorySegments, folderRelativePath, scanImages } from './directory';

class MemoryDirectory {
  kind = 'directory' as const;
  children = new Map<string, MemoryDirectory | MemoryFile>();

  constructor(public name = '') {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const child = this.children.get(name);
    if (child instanceof MemoryDirectory) return child;
    if (!options?.create) throw new Error(`missing ${name}`);
    const directory = new MemoryDirectory(name);
    this.children.set(name, directory);
    return directory;
  }

  async *entries(): AsyncGenerator<[string, MemoryDirectory | MemoryFile]> {
    yield* this.children.entries();
  }

  allPaths(prefix = ''): string[] {
    const own = prefix ? `${prefix}/${this.name}` : this.name;
    const directories = [...this.children.values()].filter(
      (child): child is MemoryDirectory => child instanceof MemoryDirectory,
    );
    if (directories.length === 0) return own ? [own] : [];
    return directories.flatMap((child) => child.allPaths(own));
  }
}

class MemoryFile {
  kind = 'file' as const;
  constructor(public name: string, private file: File) {}
  async getFile() {
    return this.file;
  }
}

describe('local directory adapter', () => {
  it('removes only the browser-selected root folder before exact matching', () => {
    expect(folderRelativePath('사진/GENERAL/FWD/PORT/BEFORE/a.jpg')).toBe('GENERAL/FWD/PORT/BEFORE/a.jpg');
    expect(folderRelativePath('사진/POLISHING/GENERAL/FWD/PORT/BEFORE/a.jpg')).toBe('POLISHING/GENERAL/FWD/PORT/BEFORE/a.jpg');
    expect(folderRelativePath('NICHE/SEA CHEST/PORT/01/AFTER/a.jpg')).toBe('NICHE/SEA CHEST/PORT/01/AFTER/a.jpg');
    expect(folderRelativePath('misc/a.jpg')).toBe('misc/a.jpg');
  });

  it('adds a Service folder only for targets with overlapping phases', async () => {
    const [first, second] = createGeneralTargets();
    const sections = createReportSections([
      { ...first, services: ['CLEANING', 'POLISHING'] },
      { ...second, services: ['INSPECTION', 'POLISHING'] },
    ]);
    const root = new MemoryDirectory();
    await createSectionTree(root, sections);
    expect(root.allPaths()).toEqual(expect.arrayContaining([
      'CLEANING/GENERAL/FWD/PORT/BEFORE',
      'POLISHING/GENERAL/FWD/PORT/AFTER',
      'GENERAL/FWD/STBD/CURRENT',
      'GENERAL/FWD/STBD/BEFORE',
    ]));
    expect(root.allPaths()).not.toContain('GENERAL/FWD/PORT/BEFORE');
  });

  it('creates the exact Section/Side/Unit/Phase hierarchy', async () => {
    const root = new MemoryDirectory();
    const [section] = createNicheSections({
      component: 'Sea Chest',
      type: 'SIDE_QUANTITY',
      quantity: 1,
      service: 'CLEANING',
    });
    expect(directorySegments(section, 'BEFORE')).toEqual([
      'NICHE',
      'SEA CHEST',
      'PORT',
      '01',
      'BEFORE',
    ]);
    await createSectionTree(root, [section]);
    expect(root.allPaths()).toEqual([
      'NICHE/SEA CHEST/PORT/01/BEFORE',
      'NICHE/SEA CHEST/PORT/01/AFTER',
    ]);
  });

  it('recursively returns images only with normalized relative paths', async () => {
    const root = new MemoryDirectory();
    const general = await root.getDirectoryHandle('GENERAL', { create: true });
    const fwd = await general.getDirectoryHandle('FWD', { create: true });
    const port = await fwd.getDirectoryHandle('PORT', { create: true });
    const before = await port.getDirectoryHandle('BEFORE', { create: true });
    before.children.set(
      'a.jpg',
      new MemoryFile('a.jpg', new File(['image'], 'a.jpg', { type: 'image/jpeg' })),
    );
    before.children.set(
      'notes.txt',
      new MemoryFile('notes.txt', new File(['text'], 'notes.txt', { type: 'text/plain' })),
    );
    const result = await scanImages(root);
    expect(result.map((item) => item.relativePath)).toEqual([
      'GENERAL/FWD/PORT/BEFORE/a.jpg',
    ]);
  });
});
