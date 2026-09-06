import { describe, it, expect } from 'vitest';
import { snapshotFingerprint } from './fingerprint';
describe('snapshot content comparison', () => {
  it('ignores new wrapper and navigation without losing file changes', () => {
    const file = new File(['a'], 'same.jpg');
    const old = { stage: 5, value: { file, text: 'keep' } };
    expect(snapshotFingerprint({ value: old.value, stage: 6 })).toBe(snapshotFingerprint(old));
    expect(snapshotFingerprint({ ...old, value: { ...old.value, file: new File(['b'], 'same.jpg') } })).not.toBe(snapshotFingerprint(old));
  });
});
