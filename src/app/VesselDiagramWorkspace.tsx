import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReportInfo } from './reportInfo';
import type { ReportSection } from '../domain/types';
import { DEFAULT_CALIBRATION, type VesselDiagramConfig } from '../vesselDiagram/types';
import { createDefaultHullMarkers, createDefaultNicheMarkers } from '../vesselDiagram/geometry';
import { bilgeQuantityFromSections } from '../vesselDiagram/markers';
import { diagramConfirmed, recommendLayout, reconcileDiagramMarkers, validateLayoutRecords, viewForSection, type DiagramView, type LayoutRecord } from '../vesselDiagram/layoutLibrary';
import { getDraft, saveDraft } from '../persistence/draftStore';
import { packArchive, unpackArchive } from '../persistence/archive';
import { downloadLocalBlob } from './DraftToolbar';
import { VesselDiagramEditor } from './VesselDiagramEditor';
import { VesselDiagramPreview } from './VesselDiagramPreview';
import { conciseSectionLabel } from './reportLabels';
import {Modal} from './Modal';
const savedLayoutTime=()=>Date.now();

export function VesselDiagramWorkspace({value,onChange,sections,info,onBack,onNext}: {
  value:VesselDiagramConfig|null;onChange:(value:VesselDiagramConfig)=>void;sections:ReportSection[];info:ReportInfo;onBack:()=>void;onNext:()=>void;
}) {
  const [view,setView]=useState<DiagramView>('SIDE');
  const [records,setRecords]=useState<LayoutRecord[]>([]);
  const revision=useRef(0);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [candidate,setCandidate]=useState<VesselDiagramConfig|null>(null);
  const [pending,setPending]=useState<VesselDiagramConfig|null>(null);
  const [undo,setUndo]=useState<VesselDiagramConfig|null>(null);
  const [notice,setNotice]=useState('');
  const savingRecord=useRef<Promise<boolean>|null>(null);
  const input=useRef<HTMLInputElement>(null);
  const current=view==='SIDE'?(value?.sideViewPending?null:value):value?.bottomView??null;
  const scopedSections=useMemo(()=>value?sections.filter((section)=>viewForSection(value,section)===view):sections,[sections,value,view]);
  useEffect(()=>{let active=true;void getDraft('vessel-layout-library','layouts').then((stored)=>{
    if(!active)return;revision.current=stored?.revision??0;setRecords(stored?validateLayoutRecords(stored.value):[]);setReady(true);
  }).catch((reason)=>{if(active)setError(`배치 기록을 불러오지 못했습니다: ${reason.message}`);});return()=>{active=false;};},[]);
  const target=useMemo(()=>({imo:info.vessel.imo.trim(),vesselType:info.vessel.type,loa:Number(info.vessel.loa.replace(/,/g,'')),breadth:Number(info.vessel.breadth.replace(/,/g,'')),view}),[info.vessel,view]);
  const base=useMemo(()=>current??{imageFile:new File([],'preview.png'),imageName:'',calibration:{...DEFAULT_CALIBRATION},hullMarkers:createDefaultHullMarkers(DEFAULT_CALIBRATION),nicheMarkers:createDefaultNicheMarkers(DEFAULT_CALIBRATION,bilgeQuantityFromSections(sections)),confirmed:false},[current,sections]);
  const recommendation=useMemo(()=>recommendLayout(target,records,base),[target,records,base]);
  const saveRecords=async(next:LayoutRecord[])=>{
    if(!ready)throw new Error('배치 저장소를 사용할 수 없습니다. 작업 파일로 백업하세요.');
    const stored=await saveDraft('vessel-layout-library',revision.current,'선박 배치 기록',next,'layouts');
    revision.current=stored.revision;setRecords(next);
  };
  const archiveConfirmed=async(config:VesselDiagramConfig,typeDefault=false)=>{
    if(!/^\d{7}$/.test(target.imo)) {setNotice('위치도는 확정했습니다. IMO 7자리를 입력하면 선박별 배치 기록에도 저장할 수 있습니다.');return true;}
    setBusy(true);
    try {
      const {bottomView:_bottom,sectionViews:_sections,useBottomView:_use,...viewOnly}=config;
      void _bottom; void _sections; void _use;
      const record:LayoutRecord={...target,id:crypto.randomUUID(),vesselName:info.vessel.name,updatedAt:savedLayoutTime(),jobNo:info.vessel.jobNo,config:viewOnly,typeDefault};
      await saveRecords([...records,record]);setNotice(typeDefault?'선종 기본 배치를 저장했습니다.':'이 선박의 확정 배치를 저장했습니다.');
      setError('');return true;
    }catch(reason){setError((reason as Error).message);return false;}finally{setBusy(false);}
  };
  const updateView=(next:VesselDiagramConfig)=>{
    const adjusted=pending?{...next,calibration:pending.calibration,hullMarkers:pending.hullMarkers,nicheMarkers:pending.nicheMarkers,markerBindings:pending.markerBindings,removedMarkerIds:pending.removedMarkerIds,confirmed:false}:next;
    if(pending)setPending(null);
    const combined=view==='SIDE'?{...adjusted,sideViewPending:false,bottomView:value?.bottomView,useBottomView:value?.useBottomView,sectionViews:value?.sectionViews}
      :value?{...value,bottomView:adjusted,useBottomView:true}
      :{...adjusted,confirmed:false,sideViewPending:true,bottomView:adjusted,useBottomView:true};
    onChange(combined);
    if(adjusted.confirmed && !current?.confirmed)savingRecord.current=archiveConfirmed(adjusted);
  };
  const chooseMean=()=>{
    const hullIds=new Set(base.hullMarkers.map((marker)=>marker.id));
    const next={...base,hullMarkers:recommendation.markers.filter((marker)=>hullIds.has(marker.id)),nicheMarkers:recommendation.markers.filter((marker)=>!hullIds.has(marker.id)),confirmed:false};
    if(!current){setPending(next);setNotice('추천 도형을 선택했습니다. 도면을 불러오면 이 배치를 사용합니다.');}else setCandidate(next);
  };
  const importRecords=async(file?:File)=>{
    if(!file)return;setBusy(true);
    try {
      const raw=await unpackArchive(file) as {kind?:string;records?:unknown};
      if(raw?.kind!=='uws-layout-library')throw new Error('배치 기록 파일을 선택하세요.');
      const imported=validateLayoutRecords(raw.records);
      const ids=new Set(records.map((record)=>record.id));const added=imported.filter((record)=>!ids.has(record.id));
      if(!window.confirm(`${added.length}개 기록을 병합할까요? 같은 IMO는 최신 확정 기록이 대표값으로 사용됩니다. 기존 이력은 유지됩니다.`))return;
      await saveRecords([...records,...added]);setNotice(`${added.length}개 기록을 가져왔습니다.`);
    }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  };
  return <>
    <section className="layout-library panel" aria-label="선박 배치 추천">
      <div className="layout-library-actions"><button type="button" aria-pressed={view==='SIDE'} onClick={()=>{setView('SIDE');setPending(null);}}>사이드뷰</button>
        <button type="button" aria-pressed={view==='BOTTOM'} onClick={()=>{setView('BOTTOM');setPending(null);if(value)onChange({...value,useBottomView:true});}}>바텀뷰 맞추기</button>
        {value?.useBottomView && <button type="button" onClick={()=>{if(!window.confirm('바텀뷰 연결을 해제하고 사이드뷰로 표시할까요? 저장한 바텀뷰는 유지합니다.'))return;onChange({...value,useBottomView:false,sectionViews:{}});setView('SIDE');}}>바텀뷰 사용 해제</button>}
      </div>
      <h3>{view==='SIDE'?'사이드뷰':'바텀뷰'} 추천 배치</h3>
      {value?.sideViewPending&&<p role="status">바텀뷰는 보관되어 있습니다. 사이드뷰 이미지를 등록한 뒤 사용하는 위치도를 모두 확정하세요.</p>}
      <p>{info.vessel.type||'선종 미입력'} · LOA {info.vessel.loa||'—'} m · 선폭 {info.vessel.breadth||'—'} m · 유사 크기 각각 ±20%</p>
      <p>같은 IMO 기록 → 유사 선박 평균 → 선종 기본 → 공통 기본. 이미지를 바꿔도 도형은 유지됩니다.</p>
      <button type="button" onClick={chooseMean}>추천 도형 배치 확인</button>
      {undo&&<button type="button" onClick={()=>{onChange(undo);setUndo(null);}}>배치 불러오기 실행 취소</button>}
      {records.filter((record)=>record.imo===target.imo&&record.view===view&&!record.typeDefault).sort((a,b)=>b.updatedAt-a.updatedAt).map((record)=><button type="button" key={record.id} onClick={()=>setCandidate(reconcileDiagramMarkers(record.config,scopedSections,true))}>{record.jobNo||record.vesselName} · {new Date(record.updatedAt).toLocaleDateString()} 도면·배치 불러오기 · 저장: {record.vesselType} / {record.loa} × {record.breadth} m{(record.loa!==target.loa||record.breadth!==target.breadth)?' · 현재 제원과 다름':''}</button>)}
      <details><summary>부위별 추천 근거</summary><ul>{recommendation.sources.map((source)=><li key={source.markerId}>{source.markerId}: {({IMO:'동일 선박',MEAN:'평균 배치',REFERENCE:'참고 배치 · 표본 부족',TYPE:'선종 기본',DEFAULT:'공통 기본'})[source.origin]} · {source.sampleCount}척{source.updatedAt?` · ${new Date(source.updatedAt).toLocaleDateString()}`:''}</li>)}</ul></details>
      {recommendation.heldOut.length>0&&<details open><summary>평균 반영 보류 {recommendation.heldOut.length}개</summary>{recommendation.heldOut.map((item)=><div key={`${item.recordId}-${item.markerId}`}>{records.find((record)=>record.id===item.recordId)?.vesselName} · {item.markerId}
        <button type="button" disabled={busy} onClick={()=>{void saveRecords(records.map((record)=>record.id===item.recordId?{...record,acceptedOutliers:[...(record.acceptedOutliers??[]),item.markerId]}:record)).catch((reason)=>setError(reason.message));}}>실제 배치로 확인·평균 포함</button></div>)}</details>}
      <details><summary>배치 기록 관리 · 이 브라우저에만 저장</summary>
        <button type="button" disabled={busy||!current?.confirmed} onClick={()=>{if(current)void archiveConfirmed(current);}}>현재 확정 배치 저장</button>
        <button type="button" disabled={busy||!current?.confirmed||!target.vesselType} onClick={()=>{if(current&&window.confirm('이 배치를 해당 선종의 기본값으로도 사용할까요?'))void archiveConfirmed(current,true);}}>선종 기본값으로 저장</button>
        <button type="button" disabled={busy} onClick={()=>{void packArchive({kind:'uws-layout-library',records}).then((blob)=>downloadLocalBlob(blob,'UWS-vessel-layouts.zip')).catch((reason)=>setError(reason.message));}}>배치 기록 백업</button>
        <button type="button" disabled={busy} onClick={()=>input.current?.click()}>배치 기록 가져오기</button>
        <input className="visually-hidden" type="file" accept=".zip" ref={input} aria-label="배치 기록 파일" onChange={(event)=>{void importRecords(event.target.files?.[0]);event.target.value='';}}/>
        {records.map((record)=><div key={record.id}>{record.vesselName} · {record.view} · {new Date(record.updatedAt).toLocaleString()}<button type="button" disabled={busy} onClick={()=>{void saveRecords(records.map((item)=>item.id===record.id?{...item,excluded:!item.excluded}:item)).catch((reason)=>setError(reason.message));}}>{record.excluded?'추천에 다시 포함':'추천에서 제외'}</button></div>)}
      </details>
      {value&&<details><summary>구역별 사용 뷰</summary>{sections.map((section)=><label key={section.id}>{conciseSectionLabel(section)}<select disabled={section.side==='BOTTOM'&&value.useBottomView!==false&&!!value.bottomView} aria-label={`${section.id} 사용 뷰`} value={viewForSection(value,section)} onChange={(event)=>onChange({...value,confirmed:false,bottomView:value.bottomView?{...value.bottomView,confirmed:false}:undefined,sectionViews:{...value.sectionViews,[section.id]:event.target.value as DiagramView}})}><option value="SIDE">사이드뷰</option><option value="BOTTOM" disabled={!value.bottomView}>바텀뷰</option></select></label>)}</details>}
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    </section>
    {candidate&&<Modal label="배치 적용 확인" onClose={()=>setCandidate(null)}><h3>배치 적용 전 확인</h3><div className="layout-comparison">{current&&<div>현재 배치<VesselDiagramPreview config={current} markerIds={[...current.hullMarkers,...current.nicheMarkers].map((marker)=>marker.id)}/></div>}<div>불러올 배치<VesselDiagramPreview config={candidate} markerIds={[...candidate.hullMarkers,...candidate.nicheMarkers].map((marker)=>marker.id)}/></div></div><button type="button" onClick={()=>{setUndo(value);updateView(candidate);setCandidate(null);setNotice('배치를 적용했습니다. 도면을 맞춘 뒤 위치도를 다시 확정하세요.');}}>이 배치 사용</button><button type="button" onClick={()=>setCandidate(null)}>취소</button></Modal>}
    <VesselDiagramEditor key={view} viewLabel={view==='SIDE'?'사이드뷰':'바텀뷰'} sections={scopedSections} value={current} onChange={updateView} onBack={onBack} onNext={async()=>{
      if(savingRecord.current){const saved=await savingRecord.current;savingRecord.current=null;if(!saved&&!window.confirm('선박별 배치 기록 저장에 실패했습니다. 현재 보고서의 위치도는 유지됩니다. 배치 기록 저장 없이 계속할까요?'))return;}
      const combined=view==='SIDE'?{...value!,confirmed:true}:{...value!,bottomView:current?{...current,confirmed:true}:undefined};
      if(diagramConfirmed(combined,sections))onNext();else{setNotice('사용하는 다른 뷰도 확정해야 컨디션을 입력할 수 있습니다.');setView(view==='SIDE'?'BOTTOM':'SIDE');}
    }}/>
  </>;
}
