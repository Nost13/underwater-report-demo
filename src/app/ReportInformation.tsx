import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { DIVER_QUALIFICATIONS, searchDiverQualifications, type DiverQualification } from './diverQualifications';
import { deriveOperationValues, type ReportInfo } from './reportInfo';

interface ReportInformationProps {
  value: ReportInfo;
  onChange: Dispatch<SetStateAction<ReportInfo>>;
  onBack: () => void;
  onNext: () => void;
}

type OperationField = keyof ReportInfo['operation'];
type ReadinessField = keyof ReportInfo['readiness'];

const operationFields: Array<[OperationField, string, string]> = [
  ['eta', 'ETA', '예: 02 Sep 2026 09:00'],
  ['etd', 'ETD', '예: 03 Sep 2026 18:00'],
  ['workWindow', 'Work Window', '예: 24 HOURS'],
  ['location', 'Location', '작업 위치'],
  ['start', 'Start', '작업 시작'],
  ['end', 'End', '작업 종료'],
  ['workingTime', 'Working Time', '예: 6 Hrs'],
  ['position', 'Position', '예: PORT SIDE'],
  ['draughtFwd', 'Draught FWD', 'm'],
  ['draughtMid', 'Draught MID', 'm'],
  ['draughtAft', 'Draught AFT', 'm'],
  ['berthingSide', 'Berthing Side', 'PORT / STBD'],
  ['weather', 'Weather', '기상'],
  ['knots', 'Knots', 'knots'],
  ['current', 'Current', 'm/s'],
  ['visibility', 'Visibility', 'm'],
  ['personnel', 'Personnel Deployed', '투입 인원'],
];

const readinessFields: Array<[ReadinessField, string, string]> = [
  ['toolboxTime', 'Toolbox / LOTO Time', '시간'],
  ['toolboxNote', 'Toolbox Note', '내용'],
  ['preparationTime', 'Preparation Time', '시간'],
  ['preparationNote', 'Preparation Note', '내용'],
];

export function ReportInformation({ value, onChange, onBack, onNext }: ReportInformationProps) {
  const [diverSearch, setDiverSearch] = useState('');
  const diverResults = useMemo(() => {
    if (!diverSearch.trim()) return [];
    const selected = new Set(value.personnelQualifications.map((person) => person.certificateNo));
    return searchDiverQualifications(diverSearch)
      .filter((person) => !selected.has(person.certificateNo))
      .slice(0, 8);
  }, [diverSearch, value.personnelQualifications]);
  const setOperation = (field: OperationField, next: string) => onChange((current) => ({
    ...current,
    operation: deriveOperationValues({ ...current.operation, [field]: next }, field),
  }));
  const setReadiness = (field: ReadinessField, next: string) => onChange((current) => ({
    ...current,
    readiness: { ...current.readiness, [field]: next },
  }));
  const setPersonnel = (next: DiverQualification[]) => onChange((current) => ({
    ...current,
    personnelQualifications: next,
    operation: {
      ...current.operation,
      personnel: next.length ? `DIVER : ${next.length}` : '',
    },
  }));
  const addPersonnel = (person: DiverQualification) => {
    setPersonnel([...value.personnelQualifications, person]);
    setDiverSearch('');
  };
  const removePersonnel = (certificateNo: string) => setPersonnel(
    value.personnelQualifications.filter((person) => person.certificateNo !== certificateNo),
  );

  return <div className="workspace report-information-workspace">
    <div className="page-heading"><div><p className="step-kicker">STEP 02</p><h2>Report Information</h2><p>1–4 양식에 들어갈 운항·작업 정보를 입력하세요. 비워 둔 항목은 문서에서도 공란으로 유지됩니다.</p></div><span className="privacy-chip">LOCAL ONLY</span></div>
    <section className="panel report-information-panel" aria-label="Operational Information">
      <header className="report-information-title"><span>02</span><div><h3>Operational Information</h3><p>VESSEL SCHEDULE · OPERATION RECORD · VESSEL &amp; SITE</p></div></header>
      <div className="report-information-grid">
        {operationFields.map(([field, label, placeholder]) => <label className={field === 'personnel' ? 'field span-2' : 'field'} key={field}>
          <span>{label}</span>
          <input aria-label={label} value={value.operation[field]} placeholder={placeholder} onChange={(event) => setOperation(field, event.target.value)} />
        </label>)}
      </div>
    </section>
    <section className="panel report-information-panel personnel-qualification-panel" aria-label="Personnel Qualifications">
      <header className="report-information-title"><span>03</span><div><h3>Personnel Qualifications</h3><p>SECTION 8 · 등록 인원 {DIVER_QUALIFICATIONS.length}명 · 회사 구분 없음</p></div></header>
      <label className="field personnel-search"><span>Diver search</span><input aria-label="Diver search" value={diverSearch} placeholder="한글명 · 영문명 · 자격증 번호" onChange={(event) => setDiverSearch(event.target.value)} /></label>
      {diverSearch.trim() && <div className="personnel-search-results" aria-label="자격 인원 검색 결과">
        {diverResults.length ? diverResults.map((person) => <button type="button" key={person.certificateNo} aria-label={`${person.koreanName} 선택`} onClick={() => addPersonnel(person)}>
          <span><b>{person.koreanName}</b><strong>{person.englishName}</strong></span><span>{person.qualification}</span><em>{person.certificateNo}</em>
        </button>) : <p>일치하는 미선택 인원이 없습니다.</p>}
      </div>}
      {value.personnelQualifications.length > 0 ? <div className="selected-personnel-table-wrap"><table aria-label="선택한 자격 인원" className="selected-personnel-table"><thead><tr><th>NAME</th><th>ROLE</th><th>QUALIFICATION</th><th>CERTIFICATE NO.</th><th /></tr></thead><tbody>
        {value.personnelQualifications.map((person) => <tr key={person.certificateNo}><td><b>{person.englishName}</b><small>{person.koreanName}</small></td><td>{person.role}</td><td>{person.qualification}</td><td>{person.certificateNo}</td><td><button type="button" aria-label={`${person.koreanName} 제외`} onClick={() => removePersonnel(person.certificateNo)}>×</button></td></tr>)}
      </tbody></table></div> : <p className="personnel-empty">선택한 인원이 없습니다. 선택한 인원만 Section 8에 출력됩니다.</p>}
    </section>
    <section className="panel report-information-panel" aria-label="Safety and Readiness">
      <header className="report-information-title"><span>04</span><div><h3>Safety / Readiness</h3><p>Toolbox meeting과 작업 준비 기록</p></div></header>
      <div className="report-information-grid readiness">
        {readinessFields.map(([field, label, placeholder]) => <label className="field" key={field}>
          <span>{label}</span>
          <input aria-label={label} value={value.readiness[field]} placeholder={placeholder} onChange={(event) => setReadiness(field, event.target.value)} />
        </label>)}
      </div>
    </section>
    <div className="page-actions"><button type="button" className="ghost" onClick={onBack}>Vessel / Scope으로</button><button type="button" className="primary" onClick={onNext}>선박 위치도 설정으로</button></div>
  </div>;
}
