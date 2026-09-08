import {useEffect,useState,useRef} from 'react';
import type {PhotoData} from '../domain/types';
import {photoFolderContext} from '../domain/photos';
import {PhotoExplorer} from './PhotoExplorer';
import {Modal} from './Modal';
export type OpenPhotoLibrary=(title:string,limit:number,onPick:(photos:PhotoData[])=>void)=>void;
function Preview({file}:{file:File}){const ref=useRef<HTMLImageElement>(null);useEffect(()=>{const next=URL.createObjectURL(file);if(ref.current)ref.current.src=next;return()=>URL.revokeObjectURL(next);},[file]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt={file.name} loading="lazy"/>;}
export function PhotoLibraryPicker({photos,title,limit=10000,onPick,onClose,initialFilter='ALL'}:{photos:PhotoData[];title:string;limit?:number;onPick:(photos:PhotoData[])=>void;onClose:()=>void;initialFilter?:string}){
  const[filter,setFilter]=useState(initialFilter),[selected,setSelected]=useState<string[]>([]);
  const visible=photos.filter((photo)=>filter==='ALL'||(filter==='UNASSIGNED'?photo.reportUse&&(!photo.sectionId||!photo.phase):filter==='EXCLUDED'?!photo.reportUse:photo.reportUse&&!!photo.sectionId));
  const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id].slice(0,limit));
  return <Modal label={title} onClose={onClose} className="photo-library-dialog"><h3>{title}</h3><p>빈 곳을 드래그해 여러 장 선택 · Ctrl: 추가 선택 · Shift: 범위 선택 · Ctrl+A: 전체 선택</p>
    <select aria-label="사진 보관함 필터" value={filter} onChange={(event)=>setFilter(event.target.value)}><option value="ALL">전체 사진</option><option value="UNASSIGNED">미배정 사진</option><option value="ASSIGNED">배정된 사진</option><option value="EXCLUDED">보고서 제외 사진</option></select>
    <PhotoExplorer className="photo-library-grid" label="전체 사진 목록" ids={visible.map(p=>p.id)} selected={selected} onSelect={setSelected} limit={limit}>{visible.map((photo)=><article data-photo-id={photo.id} key={photo.id} className={selected.includes(photo.id)?'selected':''}><button type="button" className="library-photo-button" aria-label={`${photo.file.name} 선택`} aria-pressed={selected.includes(photo.id)}><Preview file={photo.file}/><b>{photo.file.name}</b><small>{photoFolderContext(photo.relativePath)}</small><small>{photo.sectionId?`${photo.sectionId} / ${photo.phase}`:'미배정'}{!photo.reportUse?' · 보고서 제외':''}</small></button><label><input type="checkbox" aria-label={`${photo.file.name} 추가 선택`} checked={selected.includes(photo.id)} onChange={()=>toggle(photo.id)}/>{selected.includes(photo.id)?`${selected.indexOf(photo.id)+1}번째 선택`:'선택'}</label></article>)}</PhotoExplorer>
    {!visible.length&&<p>이 분류의 사진이 없습니다. 전체 사진을 확인하거나 새 사진을 불러오세요.</p>}
    <footer className="photo-library-actions"><p role="status">선택 {selected.length}장{limit<10000?` / 최대 ${limit}장`:''}</p><button type="button" className="primary" disabled={!selected.length} onClick={()=>{onPick(selected.map((id)=>photos.find((photo)=>photo.id===id)!).filter(Boolean));onClose();}}>선택 사진 사용</button><button type="button" onClick={onClose}>닫기</button></footer>
  </Modal>;
}
