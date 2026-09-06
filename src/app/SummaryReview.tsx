import {useMemo,useState,type Dispatch} from 'react';
import {buildSummaryModel,finalPhase,type SummaryRow} from '../summary/summaryModel';
import type {ReportSection,Condition} from '../domain/types';
import {ratingFill} from '../docx/ratingPalette';
import {OverallResultEditor} from './OverallResultEditor';
import {ConditionEditor} from './ConditionEditor';
import {cloneCondition,patchCondition} from './conditionDefaults';
import {conciseSectionLabel} from './reportLabels';
import {reportReducer,type ReportState} from './reportState';
import type {ReportInfo} from './reportInfo';
import {Modal} from './Modal';

function sourcesFor(row:SummaryRow,sections:ReportSection[]) {
 return sections.filter(section=>section.area===row.area
  && (section.component==='RUDDER'?'RUDDER & PINTLE':section.component)===row.sourceComponent
  && section.side===row.side);
}
export function SummaryReview({vesselName,report,info,onInfoChange,dispatch,canEdit,onBack,onEditDetail,onNext}:{
 vesselName:string;report:ReportState;info:ReportInfo;onInfoChange:(value:ReportInfo)=>void;
 dispatch:Dispatch<Parameters<typeof reportReducer>[1]>;canEdit:boolean;
 onBack:()=>void;onEditDetail:()=>void;onNext:()=>void;
}) {
 const summary=useMemo(()=>buildSummaryModel(report.sections),[report.sections]);
 const [editing,setEditing]=useState<SummaryRow|null>(null);
 const [sourceId,setSourceId]=useState('');
 const [draft,setDraft]=useState<Condition|null>(null);
 const sources=editing?sourcesFor(editing,report.sections):[];
 const source=sources.find(section=>section.id===sourceId);
 const phase=source?finalPhase(source):null;
 const close=()=>{setEditing(null);setSourceId('');setDraft(null);};
 const selectSource=(id:string)=>{const section=sources.find(item=>item.id===id);setSourceId(id);setDraft(section&&section.conditions[finalPhase(section)]?cloneCondition(section.conditions[finalPhase(section)]!):null);};
 return <div className="workspace summary-workspace">
  <div className="page-heading"><div><p className="step-kicker">STEP 08</p><h2>Summary 확인</h2><p>Detail 입력값에서 자동 작성됩니다. 실제 Scope에 있는 구역만 표시합니다.</p></div></div>
  <OverallResultEditor report={report} info={info} onChange={onInfoChange}/>
  {!canEdit&&<p role="status">컨디션 수정은 선박 위치도를 확정한 뒤 가능합니다. 현재 내용 확인과 Word 다운로드는 가능합니다.</p>}
  {([{label:'MAIN HULL',rows:summary.mainHullRows},{label:'NICHE',rows:summary.nicheRows}]).map(({label,rows})=>rows.length>0&&<section key={label} className="summary-matrix-card">
   <header><div><span>5.3 OVERALL FINDINGS MATRIX · {label}</span><h3>{vesselName}</h3></div><b>{rows.length}개 구역</b></header>
   <div className="summary-table-wrap"><table aria-label={`${label} Finding Matrix`}><colgroup>{[15,9,6,18,8,6,15,15,8].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead>
    <tr><th rowSpan={2}>COMPONENT</th><th rowSpan={2}>SIDE</th><th colSpan={3}>FOULING CONDITION</th><th colSpan={3}>OBSERVED CONDITION</th><th rowSpan={2}>최종 수정</th></tr>
    <tr><th>RATING</th><th>TYPE</th><th>COVERAGE</th><th>RATING</th><th>LEVEL</th><th>TYPE</th></tr>
   </thead><tbody>{rows.map(row=><tr key={row.key}><td>{row.component}</td><td>{row.side?row.side==='BOTTOM'?'BOTTOM':`${row.side} SIDE`:'—'}</td>
    <td><i style={{background:`#${ratingFill(row.foulingRating)}`}}>{row.foulingRating||'—'}</i></td><td>{row.foulingType||'—'}</td><td>{row.coverage||'—'}</td>
    <td><i style={{background:`#${ratingFill(row.observedRating)}`}}>{row.observedRating||'—'}</i></td><td>{row.observedLevel||'—'}</td><td>{row.observedType||'—'}</td>
    <td><button type="button" disabled={!canEdit} aria-label={`${row.component} ${row.side??''} 컨디션 수정`} onClick={()=>{setEditing(row);setSourceId('');setDraft(null);}}>수정</button></td>
   </tr>)}</tbody></table></div>
  </section>)}
  {!summary.mainHullRows.length&&!summary.nicheRows.length&&<p>표시할 Finding Matrix 구역이 없습니다.</p>}
  <div className="summary-note"><b>자동 반영 기준</b><span>두 단계 작업은 AFTER, Inspection은 CURRENT · Fin Blade는 Detail에만 포함 · 페이지 번호는 현재 생략</span></div>
  <div className="actionbar summary-actions"><button type="button" className="text-button" onClick={onBack}>← Check / Preview</button><div><button type="button" className="ghost" onClick={onEditDetail}>Detail 입력 수정</button><button type="button" className="primary" onClick={onNext}>최종 Word 준비</button></div></div>
  {editing&&<Modal label="서머리 컨디션 최종 수정" onClose={close}><h3>{editing.component} · 원본 컨디션 수정</h3>
   <p>여러 작업·Unit의 대표값일 수 있습니다. 수정할 원본을 선택하세요. 선택한 구역의 최종 단계만 변경되며 다시 확인이 필요합니다.</p>
   <label className="summary-source-label">수정할 원본 구역<select aria-label="수정할 원본 구역" value={sourceId} onChange={event=>selectSource(event.target.value)}><option value="">원본 구역 선택</option>{sources.map(section=><option key={section.id} value={section.id}>{section.service} · {conciseSectionLabel(section)} · {finalPhase(section)}</option>)}</select></label>
   {draft&&<ConditionEditor ariaPrefix="서머리" condition={draft} onPatch={patch=>setDraft(patchCondition(draft,patch))}/>}
   <div className="editor-dialog-actions"><button type="button" className="primary" disabled={!canEdit||!source||!phase||!draft} onClick={()=>{if(canEdit&&source&&phase&&draft){dispatch({type:'UPDATE_CONDITION',sectionId:source.id,phase,patch:draft});close();}}}>원본에 저장</button><button type="button" className="ghost" onClick={close}>취소</button></div>
  </Modal>}
 </div>;
}
