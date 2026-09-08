import { useState, type Dispatch } from 'react';
import { emptyCondition } from '../domain/conditions';
import type { Phase } from '../domain/types';
import { ConditionEditor } from './ConditionEditor';
import { patchCondition } from './conditionDefaults';
import { conciseSectionLabel } from './reportLabels';
import type { ReportAction, ReportState } from './reportState';
import { Modal } from './Modal';
import './ConditionMatrix.css';

const phaseNames: Record<Phase,string> = { BEFORE:'작업 전 · BEFORE', AFTER:'작업 후 · AFTER', CURRENT:'현재 · CURRENT' };

export function ConditionMatrix({report,dispatch}: {report:ReportState;dispatch:Dispatch<ReportAction>}) {
  const groups=[...new Set(report.sections.map(section=>`${section.service}|${section.area}`))];
  const [groupChoice,setGroupChoice]=useState(groups[0]??'');
  const group=groups.includes(groupChoice)?groupChoice:groups[0];
  const members=report.sections.filter(section=>`${section.service}|${section.area}`===group);
  const phases=(['BEFORE','AFTER','CURRENT'] as Phase[]).filter(phase=>members.some(section=>section.phases.includes(phase)));
  const [phaseChoice,setPhaseChoice]=useState<Phase>('BEFORE');
  const phase=phases.includes(phaseChoice)?phaseChoice:phases[0];
  const rows=members.filter(section=>section.phases.includes(phase)&&section.conditions[phase]);
  const [checked,setChecked]=useState<string[]>([]);
  const selected=rows.filter(section=>checked.includes(section.id));
  const [batchOpen,setBatchOpen]=useState(false);
  const [draft,setDraft]=useState(emptyCondition);
  const [overwrite,setOverwrite]=useState(false);
  const [notice,setNotice]=useState('');
  const protectedCount=selected.filter(section=>report.conditionSources[section.id]?.[phase]==='OVERRIDE').length;
  const clearSelection=()=>{setChecked([]);setNotice('');};
  if(!rows.length)return null;

  const apply=()=>{
    dispatch({type:'APPLY_MATRIX_CONDITION',anchorId:rows[0].id,sectionIds:selected.map(section=>section.id),phase,condition:draft,overwriteOverrides:overwrite});
    setNotice(`${phaseNames[phase]} · ${selected.length-(overwrite?0:protectedCount)}개 구역 적용${!overwrite&&protectedCount?` · 개별 수정 ${protectedCount}개 보호`:''}`);
    setBatchOpen(false);
  };
  return <section className="condition-matrix" aria-label="컨디션 입력 매트릭스">
    <header className="condition-matrix-heading"><div><p className="step-kicker">CONDITION INPUT</p><h3>컨디션 입력 매트릭스</h3>
      <p>행을 수정하면 해당 섹션에 바로 반영됩니다. 같은 상태인 구역은 선택하여 한 번에 입력하세요.</p></div>
      <span>{rows.length}개 구역 · {rows.filter(section=>report.conditionReviews?.[section.id]?.[phase]).length}개 확인</span></header>
    <div className="condition-matrix-toolbar">
      <label>작업·영역<select aria-label="매트릭스 작업·영역" value={group} onChange={event=>{setGroupChoice(event.target.value);clearSelection();}}>
        {groups.map(value=><option key={value} value={value}>{value.replace('|GENERAL',' · General (선체)').replace('|NICHE',' · Niche (부위)')}</option>)}</select></label>
      <label>단계<select aria-label="매트릭스 단계" value={phase} onChange={event=>{setPhaseChoice(event.target.value as Phase);clearSelection();}}>
        {phases.map(value=><option key={value} value={value}>{phaseNames[value]}</option>)}</select></label>
      <label className="matrix-checkbox"><input type="checkbox" aria-label="현재 목록 전체 선택" checked={selected.length===rows.length}
        onChange={event=>setChecked(event.target.checked?rows.map(section=>section.id):[])}/>현재 목록 전체 선택</label>
      <button type="button" className="primary" disabled={!selected.length} onClick={()=>{setDraft(emptyCondition());setOverwrite(false);setBatchOpen(true);}}>선택 구역 일괄 입력</button>
      <button type="button" className="ghost" disabled={!selected.some(section=>section.conditions[phase]?.fouling.coverage!==null)} onClick={()=>{
        const ready=selected.filter(section=>section.conditions[phase]?.fouling.coverage!==null);
        ready.forEach(section=>dispatch({type:'CONFIRM_CONDITION',sectionId:section.id,phase}));
        setNotice(`${ready.length}개 구역 컨디션 확인 완료 · 미입력 구역은 제외했습니다.`);
      }}>선택 구역 확인 완료</button>
      <span>{selected.length}개 선택 · 개별 수정 {protectedCount}개 보호</span>
    </div>
    <div className="condition-matrix-scroll" tabIndex={0} aria-label="구역별 컨디션 목록">
      <div className="condition-matrix-columns" aria-label="매트릭스 열 제목"><span>구역</span><span>등급</span><span>오염 유형</span><span>점유율 % · Slime</span><span>등급</span><span>관찰 상태</span><span>관찰 유형</span></div>
      {rows.map(section=><div className="condition-matrix-row" role="group" key={section.id} aria-label={`${section.id} ${phase} 컨디션`}>
        <div className="condition-matrix-location"><label className="matrix-checkbox"><input type="checkbox" aria-label={`${section.id} 선택`} checked={checked.includes(section.id)}
          onChange={event=>setChecked(current=>event.target.checked?[...current,section.id]:current.filter(id=>id!==section.id))}/><b>{conciseSectionLabel(section)}</b></label>
          <span className={report.conditionSources[section.id]?.[phase]==='OVERRIDE'?'matrix-protected':''}>{report.conditionSources[section.id]?.[phase]==='OVERRIDE'?'개별 수정 보호':'일괄 적용 가능'}</span>
          <small>{section.conditions[phase]!.fouling.coverage===null?'미입력':report.conditionReviews?.[section.id]?.[phase]?'✓ 확인 완료':'미확인'}</small></div>
        <ConditionEditor ariaPrefix={`매트릭스 ${section.id} ${phase}`} condition={section.conditions[phase]!}
          onPatch={patch=>dispatch({type:'UPDATE_CONDITION',sectionId:section.id,phase,patch})}/>
      </div>)}
    </div>
    <p className="condition-matrix-note">점유율에 따라 오염 등급이 자동 표시됩니다. Slime Only와 관찰 상태는 별도로 지정합니다. 개별 수정값은 일괄 적용 시 기본적으로 보호됩니다.</p>
    {notice&&<p role="status">{notice}</p>}
    {batchOpen&&<Modal label="선택 구역 컨디션 일괄 입력" onClose={()=>setBatchOpen(false)}>
      <h3>선택 구역 컨디션 일괄 입력</h3><p>{group.replace('|',' · ')} / {phaseNames[phase]} · {selected.length}개 선택</p>
      <ConditionEditor ariaPrefix="일괄 입력" condition={draft} onPatch={patch=>setDraft(current=>patchCondition(current,patch))}/>
      <label className="matrix-checkbox"><input type="checkbox" checked={overwrite} onChange={event=>setOverwrite(event.target.checked)}/>개별 수정값도 덮어쓰기 ({protectedCount}개)</label>
      <p>{overwrite?'선택한 개별 수정값까지 바뀝니다. 적용할 값을 확인하세요.':'개별 수정값은 유지합니다.'} 다른 작업·영역·단계와 사진은 변경하지 않습니다.</p>
      <div className="condition-matrix-toolbar"><button type="button" className="primary" onClick={apply}>선택 구역에 적용</button><button type="button" className="ghost" onClick={()=>setBatchOpen(false)}>취소</button></div>
    </Modal>}
  </section>;
}
