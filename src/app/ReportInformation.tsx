import type { Dispatch, SetStateAction } from 'react';
import type { ReportInfo } from './reportInfo';

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
  const setOperation = (field: OperationField, next: string) => onChange((current) => ({
    ...current,
    operation: { ...current.operation, [field]: next },
  }));
  const setReadiness = (field: ReadinessField, next: string) => onChange((current) => ({
    ...current,
    readiness: { ...current.readiness, [field]: next },
  }));

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
    <section className="panel report-information-panel" aria-label="Safety and Readiness">
      <header className="report-information-title"><span>03</span><div><h3>Safety / Readiness</h3><p>Toolbox meeting과 작업 준비 기록</p></div></header>
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
