import { describe, expect, it } from 'vitest';
import { defaultWorkPerformLabel, workPerformLabelKey } from './workPerformLabels';

describe('work perform labels', () => {
  it('derives readable phase defaults', () => {
    expect(defaultWorkPerformLabel('BEFORE')).toBe('Before');
    expect(defaultWorkPerformLabel('AFTER')).toBe('After');
    expect(defaultWorkPerformLabel('CURRENT')).toBe('');
  });

  it('keys labels by Section and phase', () => {
    expect(workPerformLabelKey('rope-guard', 'BEFORE')).toBe('rope-guard::BEFORE');
  });
});
