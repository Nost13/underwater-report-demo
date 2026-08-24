import { describe, expect, it } from 'vitest';
import { createNicheSections } from '../domain/structure';
import {
  cloneCondition,
  conditionGroupKey,
  conditionGroupMembers,
  initializeConditionInheritance,
} from './conditionDefaults';

describe('condition defaults', () => {
  const polishing = createNicheSections({
    component: 'Propeller Blade',
    type: 'QUANTITY',
    quantity: 2,
    service: 'POLISHING',
  });
  const inspection = createNicheSections({
    component: 'Propeller Blade',
    type: 'QUANTITY',
    quantity: 1,
    service: 'INSPECTION',
  });

  it('groups Side and Unit children by Service, Area, and Component only', () => {
    expect(conditionGroupKey(polishing[0])).toBe(conditionGroupKey(polishing[1]));
    expect(conditionGroupKey(polishing[0])).not.toBe(conditionGroupKey(inspection[0]));
    expect(conditionGroupMembers([...polishing, ...inspection], polishing[0]))
      .toEqual(polishing);
  });

  it('initializes every present phase as GROUP with independent Condition objects', () => {
    const inheritance = initializeConditionInheritance([...polishing, ...inspection]);
    expect(inheritance.conditionSources[polishing[0].id]).toEqual({
      BEFORE: 'GROUP',
      AFTER: 'GROUP',
    });
    expect(inheritance.conditionSources[inspection[0].id]).toEqual({ CURRENT: 'GROUP' });

    const first = inheritance.conditionDefaults[conditionGroupKey(polishing[0])].BEFORE!;
    const cloned = cloneCondition(first);
    cloned.observed.type = 'Scratch';
    expect(first.observed.type).toBe('');
  });
});
