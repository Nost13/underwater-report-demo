import {useState,useId,type Dispatch,type ReactNode,type CSSProperties} from 'react';
import type {Phase,PhotoData,ReportSection} from '../domain/types';
import type {ReportAction,ReportState} from './reportState';
import {ConditionEditor} from './ConditionEditor';
import {deriveFoulingRating,deriveFoulingType,deriveObservedRating} from '../domain/conditions';
import {conciseSectionLabel} from './reportLabels';
import {defaultWorkPerformed,workPerformLabelKey} from './workPerformLabels';
import {type InsertionEdge} from './photoInsertion';
import {Modal} from './Modal';
import {OriginalPhoto} from './OriginalPhoto';
import {photoFolderContext} from '../domain/photos';
import './PhotoWorkspace.css';
export interface PhotoWorkspaceProps {
 report:ReportState;section:ReportSection;phase:Phase;dispatch:Dispatch<ReportAction>;
 onPhase:(phase:Phase)=>void;onSection:(id:string)=>void;
 onAddPhotos:(sectionId:string,phase:Phase)=>void;onOpenLibrary:()=>void;
 renderThumb:(photo:PhotoData)=>ReactNode;
}
const phaseName:Record<Phase,string>={BEFORE:'작업 전',AFTER:'작업 후',CURRENT:'현재'};
export function PhotoWorkspace(props:PhotoWorkspaceProps){
 const {report,section,dispatch,renderThumb}=props;
 const phase=section.phases.includes(props.phase)?props.phase:section.phases[0];
 const [columns,setColumns]=useState(3);
 const [libraryColumns,setLibraryColumns]=useState(2);
 // Keyed inner workspace resets transient selections when changing section or phase.
 return <div className="photo-workbench">
<nav className="photo-phase-tabs" role="tablist" aria-label="사진 단계">
  {section.phases.map(p=>
<button type="button" role="tab" key={p} aria-selected={p===phase} onClick={()=>props.onPhase(p)}>{phaseName[p]} <small>{p}</small>
<b>{report.photos.filter(photo=>photo.sectionId===section.id&&photo.phase===p&&photo.reportUse).length}장</b>
</button>)}
 </nav>
<PhotoStage key={`${section.id}:${phase}`} {...props} phase={phase} renderThumb={renderThumb} dispatch={dispatch} columns={columns} setColumns={setColumns} libraryColumns={libraryColumns} setLibraryColumns={setLibraryColumns}/>
</div>;
}
function PhotoStage({report,section,phase,dispatch,onPhase,onSection,onAddPhotos,onOpenLibrary,renderThumb,columns,setColumns,libraryColumns,setLibraryColumns}:PhotoWorkspaceProps & {columns:number;setColumns:(n:number)=>void;libraryColumns:number;setLibraryColumns:(n:number)=>void}){
 const orderHelpId=useId();
 const [selected,setSelected]=useState<string[]>([]);
 const [librarySelected,setLibrarySelected]=useState<string[]>([]);
 const [sideTab,setSideTab]=useState<'LIBRARY'|'EDIT'>('LIBRARY');
 const [editingId,setEditingId]=useState<string|null>(null);
 const [viewer,setViewer]=useState<string|null>(null);
 const [moving,setMoving]=useState<string[]|null>(null);
 const [moveSection,setMoveSection]=useState(section.id);
 const [movePhase,setMovePhase]=useState<Phase>(phase);
 const [dragged,setDragged]=useState<string|null>(null);
 const [drop,setDrop]=useState<{id:string;edge:InsertionEdge}|null>(null);
 const [conditionOpen,setConditionOpen]=useState(false);
 const photos=report.photos.filter(p=>p.sectionId===section.id&&p.phase===phase).sort((a,b)=>a.order-b.order);
 const unmatched=report.photos.filter(p=>!p.sectionId||!p.phase);
 const selectedIds=photos.filter(p=>selected.includes(p.id)).map(p=>p.id);
 const libraryIds=unmatched.filter(p=>librarySelected.includes(p.id)).map(p=>p.id);
 const editing=photos.find(p=>p.id===editingId);
 const viewing=report.photos.find(p=>p.id===viewer);
 const condition=section.conditions[phase];
 if(!condition)return null;
 const fouling=deriveFoulingRating(condition.fouling.coverage,condition.fouling.slimeOnly);
 const observed=deriveObservedRating(condition.observed.level);
 const labels=report.workPerformLabels[workPerformLabelKey(section.id,phase)]??{main:defaultWorkPerformed(section),phase};
 const source=report.conditionSources[section.id]?.[phase]??'GROUP';
 const reviewed=report.conditionReviews?.[section.id]?.[phase];
 const valid=condition.fouling.coverage!==null&&!!condition.fouling.type;
 const toggle=(ids:string[],id:string)=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
 const beginMove=(ids:string[])=>{setMoving(ids);setMoveSection(section.id);setMovePhase(phase);};
 const reorder=(id:string,direction:'PREVIOUS'|'NEXT'|'FIRST'|'LAST')=>{
  const index=photos.findIndex(p=>p.id===id);
  if(index<0)return;
  const before=direction==='PREVIOUS'?photos[index-1]?.id:direction==='NEXT'?photos[index+2]?.id:direction==='FIRST'?photos[0]?.id:null;
  if(direction==='PREVIOUS'&&index===0)return;
  dispatch({type:'REORDER_PHOTO',photoId:id,beforePhotoId:before??null});
 };
 const draggedIds=dragged?(selectedIds.includes(dragged)?selectedIds:[dragged]):[];
 const dropBlock=(targetId:string|null,edge:InsertionEdge='BEFORE')=>{
  if(!draggedIds.length||targetId&&draggedIds.includes(targetId))return;
  const remaining=photos.filter(p=>!draggedIds.includes(p.id));
  const anchor=targetId===null?null:edge==='BEFORE'?targetId:remaining[remaining.findIndex(p=>p.id===targetId)+1]?.id??null;
  draggedIds.forEach(photoId=>dispatch({type:'REORDER_PHOTO',photoId,beforePhotoId:anchor}));
 };
 const clearDrag=()=>{setDragged(null);setDrop(null);};
 const confirmNext=()=>{
  dispatch({type:'CONFIRM_CONDITION',sectionId:section.id,phase});
  const index=section.phases.indexOf(phase);
  if(index<section.phases.length-1)onPhase(section.phases[index+1]);
  else {const next=report.sections[report.sections.findIndex(s=>s.id===section.id)+1];if(next)onSection(next.id);}
 };
 const previousSection=report.sections[report.sections.findIndex(s=>s.id===section.id)-1];
 const previousCondition=previousSection?.service===section.service?previousSection.conditions[phase]:undefined;
 const editPhoto=(id:string)=>{setEditingId(id);setSideTab('EDIT');};
 return <div className="photo-stage-layout">
<section className="photo-stage-main selected" aria-label={`${phase} 사진 갤러리`}>
  <div className="work-perform-editor">
<span>WORK PERFORMED</span>{(['main','phase'] as const).map(field=>
<label key={field}>
<span>{field==='main'?'작업명':'단계 문구'}</span>
<input aria-label={`${phase} ${field==='main'?'작업명':'단계 문구'}`} value={labels[field]} onChange={e=>dispatch({type:'UPDATE_WORK_PERFORM_LABEL',sectionId:section.id,phase,field,value:e.target.value})}/>
</label>)}</div>
  <section className="photo-condition-summary">
<div className="photo-condition-heading">
<b>{phaseName[phase]} 컨디션</b>
<span>{source==='MATRIX'?'매트릭스 입력':source==='OVERRIDE'?'개별 수정':'기본값 사용'}</span>
<button type="button" aria-expanded={conditionOpen} onClick={()=>setConditionOpen(!conditionOpen)}>컨디션 수정 <span aria-hidden="true">{conditionOpen?'⌃':'⌄'}</span>
</button>
</div>
   <div className="photo-condition-metrics" aria-label="컨디션 요약" aria-live="polite">
<div>
<small>오염 상태</small>
<strong>
<b className={`rating-badge rating-${fouling||'empty'}`}>{fouling?`R${fouling}`:'—'}</b>{deriveFoulingType(condition.fouling.coverage,condition.fouling.slimeOnly)||'미입력'}</strong>
</div>
<div>
<small>표면 점유율</small>
<strong>{condition.fouling.coverage===null?'—':`${condition.fouling.coverage}%`}</strong>{condition.fouling.slimeOnly&&<em>Slime Only</em>}</div>
<div>
<small>관찰 상태</small>
<strong>
<b className={`rating-badge rating-${observed||'empty'}`}>{observed?`R${observed}`:'—'}</b>{condition.observed.level||'없음'}</strong>
<span>{condition.observed.type}</span>
</div>
</div>
   {conditionOpen&&<ConditionEditor ariaPrefix={phase} condition={condition} onPatch={patch=>dispatch({type:'UPDATE_CONDITION',sectionId:section.id,phase,patch})}/>}
   {source==='OVERRIDE'&&<button type="button" className="condition-revert" aria-label={`${phase} 기본값으로 되돌리기`} onClick={()=>dispatch({type:'REVERT_CONDITION_TO_GROUP',sectionId:section.id,phase})}>부위 기본값으로 되돌리기</button>}
  </section>
  <div className="photo-quick-actions">
<span>{reviewed?'✓ 컨디션 확인 완료':valid?'입력됨 · 확인 전':'컨디션 미입력'}</span>
<button type="button" disabled={!previousCondition} onClick={()=>{if(previousCondition)dispatch({type:'UPDATE_CONDITION',sectionId:section.id,phase,patch:previousCondition});}}>이전 구역 컨디션 가져오기</button>
<button type="button" className="primary" disabled={!valid} onClick={confirmNext}>확인 후 다음 구역 →</button>
</div>
  <div className="photo-selection-tools">
<label>
<input type="checkbox" aria-label="현재 단계 사진 전체 선택" checked={photos.length>0&&selectedIds.length===photos.length} onChange={e=>setSelected(e.target.checked?photos.map(p=>p.id):[])}/> 전체 선택 <small>{photos.filter(p=>p.reportUse).length}장 보고서 사용</small>
</label>
<label>사진 크기 <select aria-label="사진 크기" value={columns} onChange={e=>setColumns(Number(e.target.value))}>
<option value="3">크게 · 3열</option>
<option value="4">작게 · 4열</option>
</select>
</label>
</div>
  <div className="photo-batch-actions">
<strong>{selectedIds.length?`${selectedIds.length}장 선택`:'사진을 선택해 주세요'}</strong>
<button type="button" disabled={!selectedIds.length} onClick={()=>beginMove(selectedIds)}>선택 사진 이동</button>
<button type="button" disabled={!selectedIds.length} onClick={()=>{selectedIds.forEach(photoId=>dispatch({type:'UNASSIGN_PHOTO',photoId}));setSelected([]);}}>배정 해제</button>
<button type="button" disabled={!selectedIds.length} onClick={()=>selectedIds.forEach(photoId=>{if(report.photos.find(p=>p.id===photoId)?.reportUse)dispatch({type:'TOGGLE_REPORT_USE',photoId});})}>보고서 제외</button>
<button type="button" disabled={!selectedIds.length} onClick={()=>selectedIds.forEach(photoId=>{if(!report.photos.find(p=>p.id===photoId)?.reportUse)dispatch({type:'TOGGLE_REPORT_USE',photoId});})}>보고서 포함</button>
<button type="button" disabled={!selectedIds.length} onClick={()=>setSelected([])}>선택 해제</button>
</div>
  <span id={orderHelpId} className="visually-hidden">같은 단계에서 화살표 키로 이동, Home 처음, End 마지막으로 이동합니다.</span>
  <div className="workbench-photo-grid" style={{'--photo-cols':columns} as CSSProperties}>{photos.map((photo,index)=>
<article key={photo.id} aria-label={`${photo.file.name} 사진`} draggable onDragStart={()=>setDragged(photo.id)} onDragEnd={clearDrag} onDragOver={e=>{if(!dragged||draggedIds.includes(photo.id))return;e.preventDefault();const r=e.currentTarget.getBoundingClientRect();setDrop({id:photo.id,edge:e.clientX>r.left+r.width/2?'AFTER':'BEFORE'});}} onDrop={e=>{e.preventDefault();if(dragged&&drop?.id===photo.id)dropBlock(photo.id,drop.edge);clearDrag();}} className={`workbench-photo${dragged===photo.id?' dragging':''}${selectedIds.includes(photo.id)?' picked':''}${photo.reportUse?'':' excluded'}${drop?.id===photo.id?` drop-target insert-${drop.edge.toLowerCase()}`:''}`}>
   <div className="workbench-image">
<button type="button" className="photo-open" aria-label={`${photo.file.name} 사진 편집`} onClick={()=>editPhoto(photo.id)}>{renderThumb(photo)}</button>
<label className="photo-pick">
<input type="checkbox" aria-label={`${photo.file.name} 사진 선택`} checked={selectedIds.includes(photo.id)} onChange={()=>setSelected(toggle(selectedIds,photo.id))}/>
</label>
<button type="button" className="photo-zoom" aria-label={`${photo.file.name} 확대`} onClick={()=>setViewer(photo.id)}>⛶</button>
<span className="photo-number">{String(index+1).padStart(2,'0')}</span>{!photo.reportUse&&<span className="photo-excluded">보고서 제외</span>}</div>
<b className="photo-filename" title={photo.file.name}>{photo.file.name}</b>
<small>{conciseSectionLabel(section)} · {phaseName[phase]}</small>{photo.captionText&&<p aria-label={`${photo.file.name} 캡션 미리보기`}>{photo.captionText}</p>}<button type="button" className="photo-order-key" aria-label={`${photo.file.name} 순서 이동`} aria-keyshortcuts="ArrowLeft ArrowUp ArrowRight ArrowDown Home End" aria-describedby={orderHelpId} title="화살표 키로 이동 · Home 처음 · End 마지막" onKeyDown={e=>{const directions:Record<string,'PREVIOUS'|'NEXT'|'FIRST'|'LAST'>={ArrowLeft:'PREVIOUS',ArrowUp:'PREVIOUS',ArrowRight:'NEXT',ArrowDown:'NEXT',Home:'FIRST',End:'LAST'};if(directions[e.key]){e.preventDefault();reorder(photo.id,directions[e.key]);}}}>↔ 순서</button>
  </article>)}</div>
  {!photos.length&&<div className="workbench-empty">
<b>{phaseName[phase]} 사진이 없습니다.</b>
<p>오른쪽에서 사진을 선택해 배정하거나 새 사진을 추가하세요.</p>
<button type="button" className="primary" aria-label={`${phase} 새 사진 추가`} onClick={()=>onAddPhotos(section.id,phase)}>＋ 새 사진 추가</button>
</div>}
  <div className={`workbench-drop-end${dragged?' drop-target':''}`} role="button" aria-label={`${phase} 사진 맨 뒤로 이동`} onDragOver={e=>{if(dragged)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(dragged)dropBlock(null);clearDrag();}}>사진 사이에 놓으면 해당 순서로 이동 · 여기에 놓으면 맨 뒤로 이동</div>
 </section>
<aside className="photo-tools">
<nav role="tablist" aria-label="사진 도구">
<button type="button" role="tab" aria-selected={sideTab==='LIBRARY'} onClick={()=>setSideTab('LIBRARY')}>미배정 사진 {unmatched.length}</button>
<button type="button" role="tab" aria-selected={sideTab==='EDIT'} onClick={()=>setSideTab('EDIT')}>사진 편집</button>
</nav>
 {sideTab==='LIBRARY'?<div className="photo-library">
<div className="photo-library-target">배정할 위치 <b>{conciseSectionLabel(section)} · {phaseName[phase]}</b>
</div>
<label className="library-density">사진 배열 <select aria-label="미배정 사진 배열" value={libraryColumns} onChange={e=>setLibraryColumns(Number(e.target.value))}>{[2,3,4].map(n=>
<option value={n} key={n}>{n}열</option>)}</select>
</label>
<label className="library-select-all">
<input type="checkbox" checked={unmatched.length>0&&libraryIds.length===unmatched.length} onChange={e=>setLibrarySelected(e.target.checked?unmatched.map(p=>p.id):[])}/> 전체 선택 <small>{libraryIds.length}장 선택</small>
</label>
<div className="workbench-library-grid" aria-label="미배정 사진 목록" style={{'--library-cols':libraryColumns} as CSSProperties}>{unmatched.map(photo=>
<article key={photo.id}>
<div className="workbench-image">
<button type="button" className="photo-open" aria-label={`${photo.file.name} 미배정 미리보기`} onClick={()=>setViewer(photo.id)}>{renderThumb(photo)}</button>
<label className="photo-pick">
<input type="checkbox" aria-label={`${photo.file.name} 미배정 선택`} checked={libraryIds.includes(photo.id)} onChange={()=>setLibrarySelected(toggle(libraryIds,photo.id))}/>
</label>
</div>
<b className="photo-filename" title={photo.file.name}>{photo.file.name}</b>
<small>{photoFolderContext(photo.relativePath)}</small>
</article>)}</div>{!unmatched.length&&<p>미배정 사진이 없습니다.</p>}<div className="photo-library-footer">
<button type="button" className="primary" disabled={!libraryIds.length} onClick={()=>{dispatch({type:'ASSIGN_PHOTOS',photoIds:libraryIds,sectionId:section.id,phase});setLibrarySelected([]);}}>선택한 {libraryIds.length}장 배정</button>
<button type="button" aria-label={`${phase} 내 사진 추가`} onClick={()=>onAddPhotos(section.id,phase)}>＋ 내 사진 추가</button>
<button type="button" onClick={onOpenLibrary}>전체 사진 보관함</button>
</div>
</div>:<div className="photo-side-editor">{editing?<>
<div className="workbench-image">{renderThumb(editing)}</div>
<b className="photo-filename">{editing.file.name}</b>
<label>추가 캡션<textarea aria-label={`${editing.file.name} 추가 캡션`} placeholder="설명이 필요한 사진에만 입력하세요" value={editing.captionText} onChange={e=>dispatch({type:'UPDATE_PHOTO_CAPTION',photoId:editing.id,value:e.target.value})}/>
</label>
<label>
<input type="checkbox" aria-label={`${editing.file.name} Report Use`} checked={editing.reportUse} onChange={()=>dispatch({type:'TOGGLE_REPORT_USE',photoId:editing.id})}/> 보고서에 포함</label>
<button type="button" aria-label={`${editing.file.name} 이동`} onClick={()=>beginMove([editing.id])}>다른 구역·단계로 이동</button>
<button type="button" aria-label={`${editing.file.name} 미배정으로 이동`} onClick={()=>{dispatch({type:'UNASSIGN_PHOTO',photoId:editing.id});setEditingId(null);setSideTab('LIBRARY');}}>미배정으로 이동</button>
<small>수정 내용은 작업에 즉시 반영됩니다.</small>
</>:<p>사진을 누르면 여기에서 캡션과 보고서 포함 여부를 수정할 수 있습니다.</p>}</div>}
 </aside>{moving&&<Modal label="선택 사진 이동" onClose={()=>setMoving(null)}>
<h3>{moving.length}장 이동</h3>
<label>구역<select aria-label="선택 사진 이동 구역" value={moveSection} onChange={e=>{setMoveSection(e.target.value);setMovePhase(report.sections.find(s=>s.id===e.target.value)!.phases[0]);}}>{report.sections.map(s=>
<option key={s.id} value={s.id}>{s.service} · {conciseSectionLabel(s)}</option>)}</select>
</label>
<label>단계<select aria-label="선택 사진 이동 단계" value={movePhase} onChange={e=>setMovePhase(e.target.value as Phase)}>{report.sections.find(s=>s.id===moveSection)?.phases.map(p=>
<option key={p} value={p}>{phaseName[p]} · {p}</option>)}</select>
</label>
<button type="button" className="primary" onClick={()=>{dispatch({type:'ASSIGN_PHOTOS',photoIds:moving,sectionId:moveSection,phase:movePhase});setMoving(null);setSelected([]);}}>이동 완료</button>
<button type="button" aria-label="이동 취소" onClick={()=>setMoving(null)}>취소</button>
</Modal>}{viewing&&<Modal label="사진 확대" onClose={()=>setViewer(null)}>
<h3>{viewing.file.name}</h3>
<div className="photo-viewer"><OriginalPhoto key={viewing.id} file={viewing.file}/></div>
<button type="button" onClick={()=>setViewer(null)}>닫기</button>
</Modal>}</div>;
}
