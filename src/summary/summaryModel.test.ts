import { describe, expect, it } from 'vitest';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import { buildSummaryModel } from './summaryModel';

describe('Summary model', () => {
  it('uses the final Detail condition, derives ratings, and excludes Fin Blade', () => {
    const cleaning = createNicheSections({
      component: 'Sea Chest', type: 'SIDE', quantity: 1, service: 'CLEANING',
    });
    cleaning[0].conditions.BEFORE = {
      fouling: { coverage: 40, slimeOnly: false, type: '' },
      observed: { level: 'Notable Observation', type: 'Damage' },
    };
    cleaning[0].conditions.AFTER = {
      fouling: { coverage: 0, slimeOnly: false, type: '' },
      observed: { level: 'Normal / Trace', type: '' },
    };
    const inspection = createNicheSections({
      component: 'Rope Guard', type: 'SINGLE', quantity: 1, service: 'INSPECTION',
    })[0];
    inspection.conditions.CURRENT = {
      fouling: { coverage: 10, slimeOnly: false, type: '' },
      observed: { level: 'Minor Observation', type: 'Scratch' },
    };
    const finBlade = createNicheSections({
      component: 'Fin Blade', type: 'QUANTITY', quantity: 1, service: 'INSPECTION',
    })[0];
    finBlade.conditions.CURRENT = {
      fouling: { coverage: 80, slimeOnly: false, type: '' },
      observed: { level: 'Critical Observation', type: 'Damage' },
    };

    const model = buildSummaryModel([cleaning[0], inspection, finBlade]);

    expect(model.nicheRows.map((row) => row.component)).toEqual(['Sea Chest', 'Rope Guard']);
    expect(model.nicheRows[0]).toMatchObject({
      side: 'PORT', phase: 'AFTER', foulingRating: '0',
      foulingType: 'Clean / No Fouling', coverage: '0%',
      observedRating: '1', observedLevel: 'Normal / Trace',
    });
    expect(model.nicheRows[1]).toMatchObject({
      phase: 'CURRENT', foulingRating: '3', foulingType: 'Medium Macro Fouling',
      coverage: '10%', observedRating: '2', observedType: 'Scratch',
    });
    expect(model.overviewRows.some((row) => row.component === 'Fin Blade')).toBe(false);
  });

  it('orders Main Hull and Niche rows by the findings matrix rather than scope input order', () => {
    const general = createGeneralSections('INSPECTION');
    const selectedGeneral = [
      general.find((section) => section.component === 'AFT' && section.side === 'BOTTOM')!,
      general.find((section) => section.component === 'FWD' && section.side === 'STBD')!,
      general.find((section) => section.component === 'FWD' && section.side === 'PORT')!,
    ];
    const niche = ['Rudder & Pintle', 'Bulbous Bow', 'Propeller Blade', 'Bilge Keel']
      .map((component) => createNicheSections({
        component, type: 'SINGLE', quantity: 1, service: 'INSPECTION',
      })[0]);

    const model = buildSummaryModel([...niche, ...selectedGeneral]);

    expect(model.mainHullRows.map((row) => `${row.component}/${row.side}`)).toEqual([
      'FWD/PORT', 'FWD/STBD', 'AFT/BOTTOM',
    ]);
    expect(model.nicheRows.map((row) => row.component)).toEqual([
      'Bulbous Bow', 'Bilge Keel', 'Propeller', 'Rudder & Pintle',
    ]);
  });

  it('uses the most severe final record when units or services share one matrix row', () => {
    const units = createNicheSections({
      component: 'Bow Thruster', type: 'SIDE_QUANTITY', quantity: 2, service: 'INSPECTION',
    });
    units.forEach((section, index) => {
      section.conditions.CURRENT = {
        fouling: { coverage: index === 1 ? 30 : 5, slimeOnly: false, type: '' },
        observed: { level: index === 1 ? 'Significant Observation' : 'Normal / Trace', type: index === 1 ? 'Corrosion' : '' },
      };
    });

    const model = buildSummaryModel(units);
    const port = model.nicheRows.find((row) => row.side === 'PORT')!;

    expect(port).toMatchObject({ foulingRating: '4', coverage: '30%' });
    expect(port).toMatchObject({ observedRating: '4', observedType: 'Corrosion' });
  });
});
