import { describe, expect, it } from 'vitest';
import { formatBerthingSide } from './berthingSide';

describe('berthing side formatter', () => {
  it.each([undefined, null, 7, {}, [], 'UNKNOWN'])('returns blank for unknown input %j', (value) => {
    expect(formatBerthingSide(value)).toBe('');
  });
});
