import JSZip from 'jszip';

const MAX_BYTES = 1024 * 1024 * 1024;
const MAX_MANIFEST = 16 * 1024 * 1024;
interface Asset { name: string; type: string; lastModified: number; size: number; path: string }
interface Manifest { format: 'uws-report'; version: 1; data: unknown; files: Asset[] }

export async function readBlob(blob: Blob): Promise<Uint8Array> {
  if (blob.arrayBuffer) return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function packArchive(value: unknown): Promise<Blob> {
  const zip = new JSZip();
  const files: Asset[] = [];
  const seenFiles = new Map<Blob, number>();
  const ancestors = new Set<object>();
  let bytes = 0;
  async function encode(item: unknown, depth = 0): Promise<unknown> {
    if (depth > 60) throw new Error('Archive nesting limit');
    if (item instanceof Blob) {
      if (seenFiles.has(item)) return { $uwsFile: seenFiles.get(item) };
      bytes += item.size;
      if (bytes > MAX_BYTES) throw new Error('작업 파일은 원본 합계 1 GB까지 저장할 수 있습니다.');
      const index = files.length;
      seenFiles.set(item, index);
      const path = `assets/${index}`;
      files.push({ path, name: item instanceof File ? item.name : 'image', type: item.type, lastModified: item instanceof File ? item.lastModified : 0, size: item.size });
      zip.file(path, await readBlob(item));
      return { $uwsFile: index };
    }
    if (item === null || ['string', 'boolean'].includes(typeof item)) return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) throw new Error('Invalid number'); return item; }
    if (item === undefined) return null;
    if (typeof item !== 'object') throw new Error('Unsupported archive value');
    if (ancestors.has(item)) throw new Error('Archive cycle');
    ancestors.add(item);
    let result: unknown;
    if (Array.isArray(item)) {
      const values = [];
      for (const child of item) values.push(await encode(child, depth + 1));
      result = values;
    } else {
      const values: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(item)) {
        if (['__proto__', 'constructor', 'prototype', '$uwsFile'].includes(key)) throw new Error('Invalid archive key');
        if (child !== undefined) values[key] = await encode(child, depth + 1);
      }
      result = values;
    }
    ancestors.delete(item);
    return result;
  }
  const manifest: Manifest = { format: 'uws-report', version: 1, data: await encode(value), files };
  const json = JSON.stringify(manifest);
  if (new TextEncoder().encode(json).length > MAX_MANIFEST) throw new Error('Manifest size limit');
  zip.file('manifest.json', json);
  return new Blob([await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' })], { type: 'application/zip' });
}

// Check advertised ZIP central-directory sizes before asking JSZip to inflate data.
function checkZipLimits(bytes: Uint8Array): void {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (data.getUint32(i, true) === 0x06054b50 && i + 22 + data.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || data.getUint16(end + 4, true) !== 0 || data.getUint16(end + 6, true) !== 0) throw new Error('Invalid archive');
  const entries = data.getUint16(end + 10, true);
  let offset = data.getUint32(end + 16, true);
  if (entries > 10000 || offset === 0xffffffff) throw new Error('Archive size limit');
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || data.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid archive directory');
    const size = data.getUint32(offset + 24, true);
    total += size;
    const nameLength = data.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (size === 0xffffffff || total > MAX_BYTES + MAX_MANIFEST || (name === 'manifest.json' && size > MAX_MANIFEST)) throw new Error('Archive size limit');
    offset += 46 + nameLength + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true);
  }
  if (offset !== end) throw new Error('Invalid archive directory size');
}

function boundedRead(entry: JSZip.JSZipObject, limit: number): Promise<ArrayBuffer> {
  return new Promise((resolve,reject)=>{
    const chunks:Uint8Array[]=[];let size=0;let failed=false;
    const stream=(entry as JSZip.JSZipObject & {internalStream(type:'uint8array'):JSZip.JSZipStreamHelper<Uint8Array>}).internalStream('uint8array');
    stream.on('data',(chunk:Uint8Array)=>{size+=chunk.length;if(size>limit){failed=true;stream.pause();reject(new Error('Archive inflated size limit'));return;}chunks.push(chunk);});
    stream.on('error',(error:Error)=>reject(error));
    stream.on('end',()=>{if(failed)return;const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}resolve(bytes.buffer);});
    stream.resume();
  });
}
export async function unpackArchive(blob: Blob): Promise<unknown> {
  if (blob.size > MAX_BYTES + MAX_MANIFEST) throw new Error('Archive size limit');
  const bytes = await readBlob(blob);
  checkZipLimits(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('manifest.json');
  if (!entry) throw new Error('Missing manifest');
  const manifest = JSON.parse(new TextDecoder().decode(await boundedRead(entry,MAX_MANIFEST))) as Manifest;
  if (!manifest || manifest.format !== 'uws-report' || manifest.version !== 1) throw new Error('Unsupported archive version');
  if (!Array.isArray(manifest.files) || manifest.files.length > 9999) throw new Error('Invalid file list');
  const files: File[] = [];
  let total = 0;
  for (const [index, asset] of manifest.files.entries()) {
    if (!asset || typeof asset.name !== 'string' || typeof asset.type !== 'string' || !Number.isFinite(asset.lastModified)
      || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.path !== `assets/${index}`) throw new Error('Invalid file metadata');
    total += asset.size;
    if (total > MAX_BYTES) throw new Error('Archive size limit');
    const stored = zip.file(asset.path);
    if (!stored) throw new Error('Missing file');
    const content = await boundedRead(stored,asset.size);
    if (content.byteLength !== asset.size) throw new Error('File size mismatch');
    files.push(new File([content], asset.name, { type: asset.type, lastModified: asset.lastModified }));
  }
  let nodes = 0;
  function decode(item: unknown, depth = 0): unknown {
    if (++nodes > 200000 || depth > 60) throw new Error('Archive structure limit');
    if (!item || typeof item !== 'object') return item;
    if (Array.isArray(item)) return item.map((child) => decode(child, depth + 1));
    const object = item as Record<string, unknown>;
    if ('$uwsFile' in object) {
      const index = object.$uwsFile;
      if (Object.keys(object).length !== 1 || !Number.isInteger(index) || !files[index as number]) throw new Error('Invalid file reference');
      return files[index as number];
    }
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(object)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid archive key');
      result[key] = decode(child, depth + 1);
    }
    return result;
  }
  return decode(manifest.data);
}
