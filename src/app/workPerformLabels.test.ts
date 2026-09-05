import { describe, expect, it } from 'vitest';
import { defaultWorkPerformed, initializeWorkPerformLabels, workPerformLabelKey } from './workPerformLabels';
import { createGeneralSections, createNicheSections } from '../domain/structure';

describe('work perform labels', () => {
  it('derives actual performed work and independent uppercase phase defaults', () => {
    const rope = createNicheSections({ component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'REMOVAL' })[0];
    expect(defaultWorkPerformed(rope)).toBe('ROPE REMOVAL');
    expect(initializeWorkPerformLabels([rope])[workPerformLabelKey(rope.id, 'BEFORE')]).toEqual({ main: 'ROPE REMOVAL', phase: 'BEFORE' });
    expect(defaultWorkPerformed({ ...rope, service: 'INSPECTION' })).toBe('ROPE GUARD INSPECTION');
    expect(defaultWorkPerformed(createGeneralSections('CLEANING')[0])).toBe('HULL CLEANING');
    const current = { ...rope, service: 'INSPECTION' as const, phases: ['CURRENT' as const] };
    expect(initializeWorkPerformLabels([current])[workPerformLabelKey(current.id, 'CURRENT')]).toEqual({ main: 'ROPE GUARD INSPECTION', phase: 'CURRENT' });
  });

  it('keys labels by Section and phase', () => {
    expect(workPerformLabelKey('rope-guard', 'BEFORE')).toBe('rope-guard::BEFORE');
  });
});
