import { describe, expect, it } from 'vitest';
import { COMPONENT_OPTIONS } from './demoData';

describe('niche catalog defaults', () => {
  it('defaults Propeller Blade to four quantity units', () => {
    expect(COMPONENT_OPTIONS.find((item) => item.name === 'Propeller Blade')).toMatchObject({
      defaultType: 'QUANTITY',
      defaultQuantity: 4,
    });
  });

  it('keeps the other side-less components as single targets', () => {
    for (const name of ['Rope Guard', 'Boss Cap', 'Transducer', 'Stern Frame']) {
      expect(COMPONENT_OPTIONS.find((item) => item.name === name)).toMatchObject({
        defaultType: 'SINGLE',
        defaultQuantity: 1,
      });
    }
  });
});
