import {useState} from 'react';
import type {ReportSection} from '../domain/types';
import {DIAGRAM_HEIGHT,DIAGRAM_WIDTH,type MarkerShape,type VesselDiagramConfig,type ZoneMarker} from '../vesselDiagram/types';
import {inscribeCircle,isValidRect} from '../vesselDiagram/geometry';
import {resolveMarkerIds} from '../vesselDiagram/markers';
import {Modal} from './Modal';
import {PercentControl} from './PercentControl';

export function MarkerManager({value,sections,onChange,nameMarker}:{value:VesselDiagramConfig;sections:ReportSection[];onChange:(value:VesselDiagramConfig)=>void;nameMarker:(marker:ZoneMarker)=>string}) {
  const [draft,setDraft]=useState<ZoneMarker|null>(null);const [linked,setLinked]=useState<string[]>([]);
  const [undo,setUndo]=useState<VesselDiagramConfig|null>(null);const [error,setError]=useState('');
  const markers=[...value.hullMarkers,...value.nicheMarkers];
  const start=(marker?:ZoneMarker)=>{
    setDraft(marker?{...marker,label:nameMarker(marker),rect:{...marker.rect}}:{id:`custom-${crypto.randomUUID()}`,groupId:'custom',custom:true,label:'새 표식',shape:'CIRCLE',rect:inscribeCircle({x:.45,y:.4,width:.1,height:.2},80)});
    setLinked(marker?sections.filter(section=>resolveMarkerIds(section,value).includes(marker.id)).map(section=>section.id):[]);setError('');
  };
  const commit=(remove=false)=>{
    if(!draft)return;
    if(!remove&&(!draft.label?.trim()||!isValidRect(draft.rect))){setError('이름을 입력하고 표식이 도면 영역 안에 들어오도록 위치·크기를 조절하세요.');return;}
    const bindings={...value.markerBindings,...Object.fromEntries(sections.map(section=>[section.id,resolveMarkerIds(section,value)]))};
    for(const [id,ids] of Object.entries(bindings)) {
      if (!remove && !sections.some(section=>section.id===id)) continue;
      const without=ids.filter(markerId=>markerId!==draft.id);
      bindings[id]=!remove&&linked.includes(id)?[...without,draft.id]:without;
    }
    const isHull=value.hullMarkers.some(marker=>marker.id===draft.id)||(!markers.some(marker=>marker.id===draft.id)&&linked.length>0&&linked.every(id=>sections.find(section=>section.id===id)?.area==='GENERAL'));
    const collection=isHull?'hullMarkers':'nicheMarkers';
    const previous=value[collection];
    const next=remove?previous.filter(marker=>marker.id!==draft.id):previous.some(marker=>marker.id===draft.id)?previous.map(marker=>marker.id===draft.id?{...draft,label:draft.label!.trim()}:marker):[...previous,{...draft,label:draft.label!.trim()}];
    setUndo(value);onChange({...value,[collection]:next,markerBindings:bindings,confirmed:false,removedMarkerIds:remove?[...new Set([...(value.removedMarkerIds??[]),draft.id])]:(value.removedMarkerIds??[]).filter(id=>id!==draft.id)});setDraft(null);
  };
  return <section className="marker-manager" aria-label="Scope 표식 관리"><header><h3>Scope 표식 추가·수정</h3><button type="button" className="primary" onClick={()=>start()}>표식 추가</button>{undo&&<button type="button" className="ghost" onClick={()=>{onChange({...undo,confirmed:false});setUndo(null);}}>표식 변경 실행 취소</button>}</header>
    <div className="marker-scope-list">{sections.map(section=>{const ids=resolveMarkerIds(section,value);return <div key={section.id}><b>{section.component}{section.side?` · ${section.side}`:''}{section.unit?` · ${section.unit}`:''} · {section.service}</b><span>{ids.length?ids.map(id=>{const marker=markers.find(item=>item.id===id);return marker?nameMarker(marker):'연결 누락';}).join(', '):'표식 연결 필요'}</span></div>;})}</div>
    <details><summary>전체 표식 편집 ({markers.length})</summary><div className="marker-edit-list">{markers.map(marker=><button type="button" className="ghost" key={marker.id} onClick={()=>start(marker)} aria-label={`${nameMarker(marker)} 수정`}>{nameMarker(marker)} · 수정</button>)}</div></details>
    {draft&&<Modal label="표식 추가·수정" onClose={()=>setDraft(null)}><h3>{markers.some(marker=>marker.id===draft.id)?'표식 수정':'표식 추가'}</h3><p>연결한 Scope의 위치도에 표시됩니다. 저장·삭제 후에는 위치도를 다시 확정하세요.</p><div className="marker-form">
      <label className="field"><span>표식 이름</span><input value={draft.label??''} onChange={event=>setDraft({...draft,label:event.target.value})}/></label>
      <label className="field"><span>모양</span><select value={draft.shape} disabled={!draft.custom&&draft.id.startsWith('bilge-keel-')} onChange={event=>{const shape=event.target.value as MarkerShape;setDraft({...draft,shape,rect:shape==='CIRCLE'?inscribeCircle(draft.rect):draft.rect});}}><option value="CIRCLE">원형</option><option value="RECTANGLE">직사각형</option><option value="ELLIPSE">타원형</option></select></label>
      {(['x','y','width','height'] as const).map(key=><PercentControl key={key} label={({x:'표식 가로 위치',y:'표식 세로 위치',width:'표식 가로 크기',height:'표식 세로 크기'})[key]} min={key==='x'||key==='y'?0:.001} max={1} value={draft.rect[key]} onChange={amount=>{const rect={...draft.rect,[key]:amount};if(draft.shape==='CIRCLE'&&key==='width')rect.height=amount*DIAGRAM_WIDTH/DIAGRAM_HEIGHT;if(draft.shape==='CIRCLE'&&key==='height')rect.width=amount*DIAGRAM_HEIGHT/DIAGRAM_WIDTH;setDraft({...draft,rect});}}/>)}
    </div><fieldset className="marker-links"><legend>연결 구역</legend>{sections.map(section=><label key={section.id}><input type="checkbox" aria-label={`${section.id} 연결`} checked={linked.includes(section.id)} onChange={event=>setLinked(event.target.checked?[...linked,section.id]:linked.filter(id=>id!==section.id))}/>{section.component} · {section.side??'공통'}{section.unit?` · ${section.unit}`:''} · {section.service}</label>)}</fieldset>
      <p>현재 연결: {linked.length}개 구역. 연결을 모두 해제하면 해당 구역의 위치도 확인이 필요합니다.</p>{error&&<p role="alert">{error}</p>}
      <div className="editor-dialog-actions">{markers.some(marker=>marker.id===draft.id)&&<button type="button" className="text-button" onClick={()=>commit(true)}>표식 삭제</button>}<button type="button" className="ghost" onClick={()=>setDraft(null)}>취소</button><button type="button" className="primary" onClick={()=>commit()}>표식 저장</button></div>
    </Modal>}
  </section>;
}
