import { useState } from 'react';
import type { ReportState } from './reportState';
import type { ReportInfo } from './reportInfo';
import { buildOverallResult } from '../summary/overallResult';
import { Modal } from './Modal';
export function OverallResultEditor({report,info,onChange}:{report:ReportState;info:ReportInfo;onChange:(value:ReportInfo)=>void}) {
  const generated=buildOverallResult(report.sections,report.conditionReviews??{});
  const result=buildOverallResult(report.sections,report.conditionReviews??{},info.overallResult);
  const [draft,setDraft]=useState<typeof result|null>(null);
  return <section className="summary-result-card" aria-label="Overall Result"><span>5.1 OVERALL RESULT · {info.overallResult?'수동 문구':'자동 문구'}</span><h3>{result.headline}</h3><p>{result.narrative}</p>
    {result.stale&&<p role="status">Detail 내용이 변경되었습니다. 수동 문구는 유지했으니 결과가 맞는지 확인하세요.</p>}
    <button type="button" onClick={()=>setDraft(result)}>결과 문구 수정</button>
    {draft&&<Modal label="보고서 자동 결과 문구 수정" onClose={()=>setDraft(null)}><h3>보고서 결과 문구</h3><p>저장한 문구가 Word의 5.1에 그대로 들어갑니다. 작업 결과는 실제 기록을 확인하여 작성하세요.</p>
      <label>제목<input aria-label="결과 제목" value={draft.headline} onChange={(event)=>setDraft({...draft,headline:event.target.value})}/></label>
      <label>내용<textarea aria-label="결과 내용" value={draft.narrative} onChange={(event)=>setDraft({...draft,narrative:event.target.value})}/></label>
      <button type="button" onClick={()=>{onChange({...info,overallResult:{headline:draft.headline,narrative:draft.narrative,sourceFingerprint:generated.sourceFingerprint}});setDraft(null);}}>문구 저장</button>
      <button type="button" onClick={()=>setDraft(null)}>취소</button>
      <button type="button" onClick={()=>{if(window.confirm('수동 문구를 지우고 최신 자동 문구로 돌아갈까요?')){onChange({...info,overallResult:undefined});setDraft(null);}}}>자동 문구로 복원</button>
    </Modal>}
  </section>;
}
