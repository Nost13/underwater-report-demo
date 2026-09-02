import { describe, expect, it } from 'vitest';
import { DIVER_QUALIFICATIONS, searchDiverQualifications } from './diverQualifications';

describe('diver qualification database', () => {
  it('keeps one company-neutral record per certificate number', () => {
    expect(DIVER_QUALIFICATIONS).toHaveLength(49);
    expect(new Set(DIVER_QUALIFICATIONS.map((person) => person.certificateNo))).toHaveLength(49);
    expect(DIVER_QUALIFICATIONS.every((person) => !Object.hasOwn(person, 'company'))).toBe(true);
  });

  it('finds a duplicated source person once despite punctuation differences', () => {
    expect(searchDiverQualifications('Kim-Dongu')).toEqual([
      expect.objectContaining({
        koreanName: '김동우',
        englishName: 'Kim Dongu',
        certificateNo: '22402130572M',
      }),
    ]);
  });

  it('searches by Korean name and certificate number', () => {
    expect(searchDiverQualifications('박재근')[0]?.certificateNo).toBe('16202190145C');
    expect(searchDiverQualifications('15402190377H')[0]?.englishName).toBe('Kim Dongseong');
  });
});
