import { describe, expect, it } from 'vitest';
import { mergePersonnelLibrary, personnelKey, registerPerson, validatePersonnelLibrary } from './personnelLibrary';

const person = { koreanName: '검증 인원', englishName: '', birth: '', role: 'OTHER', qualification: '', certificateNo: '', issuingBody: '' };
describe('local personnel registration', () => {
  it('preserves independent identity for people without certificates', () => {
    const first = registerPerson([], person, 'local-one');
    const second = registerPerson([first], {...person, koreanName: '다른 검증 인원'}, 'local-two');
    expect(personnelKey(first)).toBe('local-one');
    expect(personnelKey(second)).toBe('local-two');
    expect(first.certificateNo).toBe('');
  });
  it('rejects blank names and normalized duplicate names or certificate numbers', () => {
    expect(()=>registerPerson([], {...person,koreanName:'  '},'one')).toThrow();
    const first=registerPerson([], {...person,certificateNo:'QA-001'},'one');
    expect(()=>registerPerson([first], {...person,koreanName:' 검증인원 '},'two')).toThrow();
    expect(()=>registerPerson([first], {...person,koreanName:'새 인원',certificateNo:'qa001'},'two')).toThrow();
  });
  it('merges repeat backups without duplicating records or mutating old snapshots', () => {
    const first=registerPerson([],person,'one');
    expect(mergePersonnelLibrary([first],[{...first}])).toEqual([first]);
    expect(()=>mergePersonnelLibrary([first],[{...first,qualification:'Changed'}])).toThrow();
    expect(first.qualification).toBe('');
  });
  it('rejects invalid imported fields and repeated IDs', () => {
    const first=registerPerson([],person,'one');
    expect(()=>validatePersonnelLibrary([{...first,role:12}])).toThrow();
    expect(()=>validatePersonnelLibrary([first,first])).toThrow();
    expect(validatePersonnelLibrary([first])).toEqual([first]);
  });
});
