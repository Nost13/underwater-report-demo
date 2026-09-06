import type { DiverQualification } from './diverQualifications';

const fields = ['koreanName','englishName','birth','role','qualification','certificateNo','issuingBody'] as const;
const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s-]+/g,'');
export const personnelKey = (person: DiverQualification) => person.id ?? person.certificateNo;
const samePerson = (a: DiverQualification,b: DiverQualification) =>
  ['certificateNo','koreanName','englishName'].some((key) => {
    const field=key as 'certificateNo'|'koreanName'|'englishName';
    return !!normalized(a[field]) && normalized(a[field])===normalized(b[field]);
  });

export function registerPerson(existing: readonly DiverQualification[], input: DiverQualification, id: string): DiverQualification {
  const value = {...input,id};
  for (const key of fields) value[key]=value[key].trim();
  if (!id || !(value.koreanName || value.englishName)) throw new Error('한글명 또는 영문명을 입력하세요.');
  if (existing.some(person=>personnelKey(person)===id || samePerson(person,value))) throw new Error('같은 이름 또는 자격증 번호의 인원이 있습니다. 기존 인원을 확인하세요.');
  return value;
}

export function validatePersonnelLibrary(value: unknown): DiverQualification[] {
  if (!Array.isArray(value) || value.length>5000) throw new Error('인력 DB 파일 형식이 올바르지 않습니다.');
  const result: DiverQualification[]=[];
  for(const item of value) {
    if (!item || typeof item!=='object' || fields.some(key=>typeof item[key]!=='string') || typeof item.id!=='string' || !item.id) throw new Error('인력 DB 데이터가 올바르지 않습니다.');
    result.push(registerPerson(result,item,item.id));
  }
  return result;
}

export function mergePersonnelLibrary(existing: DiverQualification[], incoming: DiverQualification[]): DiverQualification[] {
  const result=[...validatePersonnelLibrary(existing)];
  for(const person of validatePersonnelLibrary(incoming)) {
    const current=result.find(item=>personnelKey(item)===personnelKey(person));
    if(current) {
      if(fields.some(key=>current[key]!==person[key])) throw new Error('같은 인원 ID의 정보가 다릅니다. 기존 DB는 유지됩니다.');
    } else result.push(registerPerson(result,person,person.id!));
  }
  return result;
}
