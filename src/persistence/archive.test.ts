import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { packArchive, unpackArchive, readBlob } from './archive';

describe('portable local report archive', () => {
  it('restores nested file bytes and metadata, including a shared readiness reference', async () => {
    const file = new File(['photo bytes'], '선박.jpg', { type: 'image/jpeg', lastModified: 123 });
    const original = { vessel: 'MSC', photo: file, nested: { files: [null, file] }, count: 3 };
    const restored = await unpackArchive(await packArchive(original)) as typeof original;
    expect(restored.vessel).toBe('MSC');
    expect(restored.photo.name).toBe('선박.jpg');
    expect(restored.photo.type).toBe('image/jpeg');
    expect(restored.photo.lastModified).toBe(123);
    expect(Array.from(await readBlob(restored.photo))).toEqual([112, 104, 111, 116, 111, 32, 98, 121, 116, 101, 115]);
    expect(restored.nested.files[0]).toBeNull();
    expect(restored.nested.files[1]).toBe(restored.photo);
  });
  it('rejects unsupported versions without trying to restore them', async () => {
    const zip = new JSZip().file('manifest.json', JSON.stringify({ format: 'uws-report', version: 9, data: {}, files: [] }));
    await expect(unpackArchive(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow(/version/i);
  });
  it('rejects missing file references rather than partially restoring', async () => {
    const zip = new JSZip().file('manifest.json', JSON.stringify({ format: 'uws-report', version: 1, data: { photo: { $uwsFile: 0 } }, files: [] }));
    await expect(unpackArchive(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow(/file/i);
  });
  it('rejects a forged metadata size even when the zip contains bytes', async () => {
    const zip = new JSZip().file('manifest.json', JSON.stringify({ format: 'uws-report', version: 1, data: {}, files: [{ name: 'x', type: '', lastModified: 0, size: 999, path: 'assets/0' }] })).file('assets/0', 'x');
    await expect(unpackArchive(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow(/size/i);
  });
});
