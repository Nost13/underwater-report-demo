const files = new WeakMap<Blob, number>();
let nextFile = 0;
export function navigationFingerprint(value:unknown):string {
 const item=value as {stage?:number;activePhotoPhase?:string;report?:{focusedSectionId?:string|null}}|null;
 return JSON.stringify([item?.stage,item?.activePhotoPhase,item?.report?.focusedSectionId]);
}
/** Compare data, not React's snapshot wrapper; File identity detects same-named replacements. */
export function snapshotFingerprint(value: unknown): string {
  return JSON.stringify(value, (key, item) => {
    if (['stage', 'activePhotoPhase', 'focusedSectionId'].includes(key)) return undefined;
    if (item instanceof Blob) {
      if (!files.has(item)) files.set(item, ++nextFile);
      return { file: files.get(item), size: item.size, type: item.type };
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.keys(item).sort().map((name) => [name, item[name]]));
    return item;
  });
}
