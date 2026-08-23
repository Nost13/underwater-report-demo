import { describe, expect, it } from 'vitest';
import { buildMarker } from './buildMarker';

describe('test harness', () => {
  it('loads production TypeScript modules', () => {
    expect(buildMarker()).toBe('underwater-report-demo');
  });
});
