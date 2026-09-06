import { useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { DIVER_QUALIFICATIONS, searchDiverQualifications, type DiverQualification } from './diverQualifications';
import type { OpenPhotoLibrary } from './PhotoLibraryPicker';
import { composePersonnel, countPersonnel, deriveOperationValues, type PersonnelCounts, type ReadinessPhotoSlots, type ReportInfo } from './reportInfo';

interface ReportInformationProps {
  onOpenLibrary?:OpenPhotoLibrary;
  value: ReportInfo;
  onChange: Dispatch<SetStateAction<ReportInfo>>;
  onBack: () => void;
  onNext: () => void;
}

type OperationField = keyof ReportInfo['operation'];
type ReadinessField = 'toolboxTime' | 'toolboxNote' | 'preparationTime' | 'preparationNote';

const scheduleFields: Array<[OperationField, string, string]> = [
  ['eta', 'ETA', '예: 02 Sep 2026 09:00'],
  ['etd', 'ETD', '예: 03 Sep 2026 18:00'],
  ['workWindow', 'Work Window', '예: 24 HOURS'],
  ['location', 'Location', '작업 위치'],
];

const recordFields: Array<[OperationField, string, string]> = [
  ['start', 'Start', '작업 시작'],
  ['end', 'End', '작업 종료'],
  ['workingTime', 'Working Time', '예: 6 Hrs'],
  ['position', 'Position', '예: PORT SIDE'],
];

const vesselSiteFields: Array<[OperationField, string, string]> = [
  ['draughtFwd', 'Draught FWD', 'm'],
  ['draughtMid', 'Draught MID', 'm'],
  ['draughtAft', 'Draught AFT', 'm'],
  ['berthingSide', 'Berthing Side', 'PORT / STBD'],
  ['weather', 'Weather', '기상'],
  ['knots', 'Knots', 'knots'],
  ['current', 'Current', 'm/s'],
  ['visibility', 'Visibility', 'm'],
];

const personnelFields: Array<[keyof PersonnelCounts, string, string]> = [
  ['siteSupervisor', 'Site Supervisor', '인원'],
  ['diver', 'Diver', '인원'],
  ['otherPersonnel', 'Other Personnel', '인원'],
];

const readinessFields: Array<[ReadinessField, string, string]> = [
  ['toolboxTime', 'Toolbox / LOTO Time', '시간'],
  ['toolboxNote', 'Toolbox Note', '내용'],
  ['preparationTime', 'Preparation Time', '시간'],
  ['preparationNote', 'Preparation Note', '내용'],
];

function createReadinessPhotoStore(file: File) {
  let url: string | null = null;
  return {
    getSnapshot: () => url,
    subscribe: (onChange: () => void) => {
      // Own the URL only after commit; replacement never shows the old file.
      const ownedUrl = URL.createObjectURL(file);
      url = ownedUrl;
      onChange();
      return () => { URL.revokeObjectURL(ownedUrl); if (url === ownedUrl) url = null; };
    },
  };
}

function ReadinessPhotoPreview({ file, alt }: { file: File; alt: string }) {
  const store = useMemo(() => createReadinessPhotoStore(file), [file]);
  const previewUrl = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
  // These local blob previews cannot use the server image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return previewUrl ? <img src={previewUrl} alt={alt} /> : null;
}

export function ReportInformation({ value, onChange, onBack, onNext,onOpenLibrary }: ReportInformationProps) {
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
    operationModes: ['workWindow','workingTime','position'].includes(field) ? { ...current.operationModes, [field]: 'MANUAL' } : current.operationModes,
    operation: deriveOperationValues({ ...current.operation, [field]: next }, field, current.operationModes),
  }));
  const setReadiness = (field: ReadinessField, next: string) => onChange((current) => ({
    ...current,
    readiness: { ...current.readiness, [field]: next },
  }));
  const setReadinessPhotos = (
    field: 'toolboxPhotos' | 'preparationPhotos',
    photos: ReadinessPhotoSlots,
  ) => onChange((current) => ({
    ...current,
    readiness: { ...current.readiness, [field]: photos },
  }));
  const setPersonnelCounts = (field: keyof PersonnelCounts, next: string) => onChange((current) => {
    const personnelCounts = { ...current.personnelCounts, [field]: next };
    return {
      ...current,
      personnelCounts,
      personnelCountModes: { ...current.personnelCountModes, [field]: 'MANUAL' },
      operation: { ...current.operation, personnel: composePersonnel(personnelCounts) },
    };
  });
  const setPersonnel = (next: DiverQualification[]) => onChange((current) => {
    const automatic = countPersonnel(next);
    const personnelCounts = { ...current.personnelCounts };
    for (const key of Object.keys(automatic) as Array<keyof PersonnelCounts>) if (current.personnelCountModes?.[key] !== 'MANUAL') personnelCounts[key] = automatic[key];
    return {
    ...current,
    personnelQualifications: next,
      personnelCounts,
      operation: { ...current.operation, personnel: composePersonnel(personnelCounts) },
    };
  });
  const addPersonnel = (person: DiverQualification) => {
    setPersonnel([...value.personnelQualifications, person]);
    setDiverSearch('');
  };
  const removePersonnel = (certificateNo: string) => setPersonnel(
    value.personnelQualifications.filter((person) => person.certificateNo !== certificateNo),
  );
  const renderOperationField = ([field, label, placeholder]: [OperationField, string, string]) => (
    <label className="field" key={field}>
      <span>{label}</span>
      {(['workWindow','workingTime','position'] as const).filter((key) => key === field).map((key) => <span key={key}><small>{value.operationModes?.[key] === 'MANUAL' ? '수동 입력 유지' : '자동 계산'}</small><button type="button" aria-label={`${label} 자동값 다시 적용`} onClick={(event) => { event.preventDefault(); onChange((current) => { const operationModes = {...current.operationModes,[key]:'AUTO' as const}; return {...current,operationModes,operation:deriveOperationValues(current.operation,undefined,operationModes)}; }); }}>자동값 다시 적용</button></span>)}
      {field === 'berthingSide'
        ? <select aria-label={label} value={value.operation.berthingSide} onChange={(event) => setOperation(field, event.target.value)}>
          <option value="">—</option><option value="PORT SIDE">PORT SIDE</option><option value="STBD SIDE">STBD SIDE</option>
        </select>
        : <input
          type={['eta', 'etd', 'start', 'end'].includes(field) ? 'datetime-local' : 'text'}
          aria-label={label}
          value={value.operation[field]}
          placeholder={placeholder}
          onChange={(event) => setOperation(field, event.target.value)}
        />}
    </label>
  );
  const renderReadinessPhotos = (
    section: 'Toolbox' | 'Preparation',
    field: 'toolboxPhotos' | 'preparationPhotos',
  ) => {
    const photos = value.readiness[field];
    const replacePhoto = (slot: number, file: File | null) => {
      const next: ReadinessPhotoSlots = [...photos];
      next[slot] = file;
      setReadinessPhotos(field, next);
    };
    return <fieldset className="readiness-photo-editor" aria-label={`${section} photos`}>
      <legend>{section} photos</legend>
      <p>{photos.filter(Boolean).length} / 2장 준비</p>
      {onOpenLibrary&&<button type="button" onClick={()=>onOpenLibrary(`${section} 사진 선택`,2,(selected)=>setReadinessPhotos(field,[selected[0]?.file??null,selected[1]?.file??null]))}>불러온 사진 보관함에서 선택</button>}
      <label className="readiness-photo-upload">
        <span>사진 최대 2장 선택</span>
        <input
          className="readiness-photo-input"
          type="file"
          accept="image/*"
          multiple
          aria-label={`Upload ${section} photos`}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []).slice(0, 2);
            setReadinessPhotos(field, [selected[0] ?? null, selected[1] ?? null]);
            event.target.value = '';
          }}
        />
      </label>
      <div className="readiness-photo-slots">
        {photos.map((file, slot) => <div className={`readiness-photo-slot ${file ? 'filled' : ''}`} role="group" aria-label={`${section} photo slot ${slot + 1}`} key={slot}>
          <div className="readiness-photo-preview">
            {file
              ? <ReadinessPhotoPreview file={file} alt={`${section} photo ${slot + 1}: ${file.name}`} />
              : <span>{section} photo {slot + 1} is empty</span>}
          </div>
          <div className="readiness-photo-slot-actions">
            <label>
              <span>{file ? '교체' : '선택'}</span>
              <input
                className="readiness-photo-input"
                type="file"
                accept="image/*"
                aria-label={`${file ? 'Replace' : 'Select'} ${section} photo ${slot + 1}`}
                onChange={(event) => {
                  replacePhoto(slot, event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </label>
            <button type="button" disabled={!file} aria-label={`Clear ${section} photo ${slot + 1}`} onClick={() => replacePhoto(slot, null)}>지우기</button>
          </div>
        </div>)}
      </div>
    </fieldset>;
  };

  return <div className="workspace report-information-workspace">
    <section className="panel report-information-panel" aria-label="General Information"><header className="report-information-title"><span>01</span><div><h3>General Information</h3><p>조회 결과를 보완하거나 선박 정보를 직접 입력합니다.</p></div></header><div className="report-information-grid">{(Object.keys(value.vessel) as Array<keyof ReportInfo['vessel']>).map((key)=><label className="field" key={key}><span>{({name:'선박명',imo:'IMO 번호',callSign:'Call Sign',type:'선종',loa:'LOA (m)',breadth:'선폭 (m)',gt:'GT',dwt:'DWT',yearBuilt:'건조 연도',ownerClient:'Owner / Client',jobNo:'Job No'})[key]}</span><input aria-label={`보고서 ${key}`} value={value.vessel[key]} onChange={(event)=>onChange((current)=>({...current,vessel:{...current.vessel,[key]:event.target.value}}))}/></label>)}</div></section>
    <div className="page-heading"><div><p className="step-kicker">STEP 02</p><h2>Report Information</h2><p>1–4 양식에 들어갈 운항·작업 정보를 입력하세요. 비워 둔 항목은 문서에서도 공란으로 유지됩니다.</p></div><span className="privacy-chip">LOCAL ONLY</span></div>
    <section className="panel report-information-panel" aria-label="Operational Information">
      <header className="report-information-title"><span>02</span><div><h3>Operational Information</h3><p>VESSEL SCHEDULE · OPERATION RECORD · VESSEL &amp; SITE</p></div></header>
      <div className="operation-records">
        <fieldset className="operation-record-row" aria-label="VESSEL SCHEDULE"><legend>VESSEL SCHEDULE</legend>{scheduleFields.map(renderOperationField)}</fieldset>
        <fieldset className="operation-record-row" aria-label="OPERATION RECORD"><legend>OPERATION RECORD</legend>{recordFields.map(renderOperationField)}</fieldset>
      </div>
      <div className="report-information-grid operation-details-grid">{vesselSiteFields.map(renderOperationField)}</div>
      <div className="personnel-counts">
        {personnelFields.map(([field, label, placeholder]) => <label className="field" key={field}>
          <span>{label}</span><input aria-label={label} value={value.personnelCounts[field]} placeholder={placeholder} onChange={(event) => setPersonnelCounts(field, event.target.value)} />
        </label>)}
        <output aria-label="Personnel Deployed">{value.operation.personnel}</output>
        <button type="button" onClick={() => onChange((current) => { const personnelCounts = countPersonnel(current.personnelQualifications); return {...current,personnelCounts,personnelCountModes:{},operation:{...current.operation,personnel:composePersonnel(personnelCounts)}}; })}>역할별 등록 인원으로 자동 계산</button>
      </div>
    </section>
    <section className="panel report-information-panel personnel-qualification-panel" aria-label="Personnel Qualifications">
      <header className="report-information-title"><span>03</span><div><h3>Personnel Qualifications</h3><p>SECTION 8 · 등록 인원 {DIVER_QUALIFICATIONS.length}명 · 회사 구분 없음</p></div></header>
      <label className="field personnel-search"><span>Diver search</span><input aria-label="Diver search" value={diverSearch} placeholder="한글명 · 영문명 · 자격증 번호" onChange={(event) => setDiverSearch(event.target.value)} onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (diverResults[0]) addPersonnel(diverResults[0]);
      }} /></label>
      {diverSearch.trim() && <div className="personnel-search-results" aria-label="자격 인원 검색 결과">
        {diverResults.length ? diverResults.map((person) => <button type="button" key={person.certificateNo} aria-label={`${person.koreanName} 선택`} onClick={() => addPersonnel(person)}>
          <span><b>{person.koreanName}</b><strong>{person.englishName}</strong></span><span>{person.qualification}</span><em>{person.certificateNo}</em>
        </button>) : <p>일치하는 미선택 인원이 없습니다.</p>}
      </div>}
      {value.personnelQualifications.length > 0 ? <div className="selected-personnel-table-wrap"><table aria-label="선택한 자격 인원" className="selected-personnel-table"><thead><tr><th>NAME</th><th>ROLE</th><th>QUALIFICATION</th><th>CERTIFICATE NO.</th><th /></tr></thead><tbody>
        {value.personnelQualifications.map((person) => <tr key={person.certificateNo}><td><b>{person.englishName}</b><small>{person.koreanName}</small></td><td><select aria-label={`${person.koreanName} 역할`} value={/SUPERVISOR|감독/i.test(person.role)?'SITE SUPERVISOR':person.role==='OTHER'?'OTHER':'DIVER'} onChange={(event) => setPersonnel(value.personnelQualifications.map((item) => item.certificateNo===person.certificateNo?{...item,role:event.target.value}:item))}><option>SITE SUPERVISOR</option><option>DIVER</option><option>OTHER</option></select></td><td>{person.qualification}</td><td>{person.certificateNo}</td><td><button type="button" aria-label={`${person.koreanName} 제외`} onClick={() => removePersonnel(person.certificateNo)}>×</button></td></tr>)}
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
      <div className="readiness-photo-editors">
        {renderReadinessPhotos('Toolbox', 'toolboxPhotos')}
        {renderReadinessPhotos('Preparation', 'preparationPhotos')}
      </div>
    </section>
    <div className="page-actions"><button type="button" className="ghost" onClick={onBack}>Vessel / Scope으로</button><button type="button" className="primary" onClick={onNext}>커버 설정으로</button></div>
  </div>;
}
