import {useEffect,useState,useRef} from 'react';
import type {PhotoData} from '../domain/types';
import {photoFolderContext} from '../domain/photos';
import {selectPhotoIds} from './photoSelection';
import {Modal} from './Modal';
export type OpenPhotoLibrary=(title:string,limit:number,onPick:(photos:PhotoData[])=>void)=>void;
function Preview({file}:{file:File}){const ref=useRef<HTMLImageElement>(null);useEffect(()=>{const next=URL.createObjectURL(file);if(ref.current)ref.current.src=next;return()=>URL.revokeObjectURL(next);},[file]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt={file.name} loading="lazy"/>;}
export function PhotoLibraryPicker({photos,title,limit=10000,onPick,onClose,initialFilter='ALL'}:{photos:PhotoData[];title:string;limit?:number;onPick:(photos:PhotoData[])=>void;onClose:()=>void;initialFilter?:string}){
  const[filter,setFilter]=useState(initialFilter),[selected,setSelected]=useState<string[]>([]),[anchor,setAnchor]=useState<string|null>(null);
  const visible=photos.filter((photo)=>filter==='ALL'||(filter==='UNASSIGNED'?photo.reportUse&&(!photo.sectionId||!photo.phase):filter==='EXCLUDED'?!photo.reportUse:photo.reportUse&&!!photo.sectionId));
  const toggle=(photo:PhotoData,ctrl:boolean,shift:boolean)=>{setSelected((current)=>selectPhotoIds(current,photo.id,visible.map((item)=>item.id),anchor,{ctrl,shift}).slice(0,limit));setAnchor(photo.id);};
  return <Modal label={title} onClose={onClose}><h3>{title}</h3><p>Ctrl: 개별 선택 · Shift: 범위 선택 · 체크박스: 선택 추가. 선택한 순서대로 배정합니다.</p>
    <select aria-label="사진 보관함 필터" value={filter} onChange={(event)=>setFilter(event.target.value)}><option value="ALL">전체 사진</option><option value="UNASSIGNED">미배정 사진</option><option value="ASSIGNED">배정된 사진</option><option value="EXCLUDED">보고서 제외 사진</option></select>
    <div className="photo-library-grid">{visible.map((photo)=><article key={photo.id} className={selected.includes(photo.id)?'selected':''}><button type="button" aria-label={`${photo.file.name} 선택`} aria-pressed={selected.includes(photo.id)} onClick={(event)=>toggle(photo,event.ctrlKey||event.metaKey,event.shiftKey)}><Preview file={photo.file}/><b>{photo.file.name}</b><small>{photoFolderContext(photo.relativePath)}</small><small>{photo.sectionId?`${photo.sectionId} / ${photo.phase}`:'미배정'}{!photo.reportUse?' · 보고서 제외':''}</small></button><label><input type="checkbox" aria-label={`${photo.file.name} 추가 선택`} checked={selected.includes(photo.id)} onChange={()=>toggle(photo,true,false)}/>{selected.includes(photo.id)?`${selected.indexOf(photo.id)+1}번째 선택`:'선택'}</label></article>)}</div>
    {!visible.length&&<p>이 분류의 사진이 없습니다. 전체 사진을 확인하거나 새 사진을 불러오세요.</p>}
    <p role="status">선택 {selected.length}장{limit<10000?` / 최대 ${limit}장`:''}</p><button type="button" disabled={!selected.length} onClick={()=>{onPick(selected.map((id)=>photos.find((photo)=>photo.id===id)!).filter(Boolean));onClose();}}>선택 사진 사용</button><button type="button" onClick={onClose}>닫기</button>
  </Modal>;
}
