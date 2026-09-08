import {useEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {selectPhotoIds} from './photoSelection';
import './PhotoExplorer.css';

type Point={x:number;y:number};
export function PhotoExplorer({ids,selected,onSelect,children,className,label,limit=10000}:{ids:string[];selected:string[];onSelect:(ids:string[])=>void;children:ReactNode;className:string;label:string;limit?:number}){
 const ref=useRef<HTMLDivElement>(null);
 const anchor=useRef<string|null>(null);
 const gesture=useRef<{start:Point;last:Point;base:string[];original:string[];moved:boolean}|null>(null);
 const [box,setBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
 const frame=useRef<number|null>(null);
 const update=()=>{
  const node=ref.current,g=gesture.current;if(!node||!g)return;
  const rect=node.getBoundingClientRect();
  const end={x:g.last.x-rect.left+node.scrollLeft,y:g.last.y-rect.top+node.scrollTop};
  if(!g.moved&&Math.hypot(end.x-g.start.x,end.y-g.start.y)<4)return;
  g.moved=true;
  const area={left:Math.min(g.start.x,end.x),top:Math.min(g.start.y,end.y),width:Math.abs(end.x-g.start.x),height:Math.abs(end.y-g.start.y)};
  setBox(area);
  const hits=Array.from(node.querySelectorAll<HTMLElement>('[data-photo-id]')).filter(card=>{
   const r=card.getBoundingClientRect(),left=r.left-rect.left+node.scrollLeft,top=r.top-rect.top+node.scrollTop;
   return left<area.left+area.width&&left+r.width>area.left&&top<area.top+area.height&&top+r.height>area.top;
  }).map(card=>card.dataset.photoId!);
  onSelect([...new Set([...g.base,...hits])].slice(0,limit));
 };
 const updateRef=useRef(update);useEffect(()=>{updateRef.current=update;});
 const stop=()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;gesture.current=null;setBox(null);};
 useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
 const scroll=()=>{
  const node=ref.current,g=gesture.current;if(!node||!g)return;
  const r=node.getBoundingClientRect();
  const bottom=Math.min(r.bottom,window.innerHeight),top=Math.max(r.top,0);
  const delta=g.last.y>bottom-30?12:g.last.y<top+30?-12:0;
  if(delta&&g.moved){const before=node.scrollTop;node.scrollTop+=delta;if(node.scrollTop!==before)updateRef.current();}
  frame.current=requestAnimationFrame(scroll);
 };
 return <div ref={ref} className={`photo-explorer ${className}`} aria-label={label} tabIndex={0}
  onPointerDown={event=>{
   if(event.button!==0||(event.target as Element).closest('[data-photo-id],button,input,select'))return;
   const node=event.currentTarget,r=node.getBoundingClientRect();
   gesture.current={start:{x:event.clientX-r.left+node.scrollLeft,y:event.clientY-r.top+node.scrollTop},last:{x:event.clientX,y:event.clientY},base:event.ctrlKey||event.metaKey?selected:[],original:selected,moved:false};
   node.setPointerCapture?.(event.pointerId);node.focus();event.preventDefault();
   frame.current=requestAnimationFrame(scroll);
  }}
  onPointerMove={event=>{if(gesture.current){gesture.current.last={x:event.clientX,y:event.clientY};update();}}}
  onPointerUp={event=>{const g=gesture.current;if(!g)return;if(!g.moved)onSelect(g.base);stop();if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
  onPointerCancel={()=>{if(gesture.current)onSelect(gesture.current.original);stop();}}
  onClickCapture={event=>{
   const target=event.target as Element,card=target.closest<HTMLElement>('[data-photo-id]');
   if(!card)return;
   if(target.closest('input,label')){anchor.current=card.dataset.photoId!;return;}
   if(target.closest('.photo-zoom,.photo-order-key'))return;
   const id=card.dataset.photoId!;
   onSelect(selectPhotoIds(selected,id,ids,anchor.current,{ctrl:event.ctrlKey||event.metaKey,shift:event.shiftKey}).slice(0,limit));
   anchor.current=id;
  }}
  onKeyDown={event=>{
   if((event.target as Element).matches('input,textarea,select'))return;
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();onSelect(ids.slice(0,limit));}
   if(event.key==='Escape'){onSelect([]);stop();}
  }}>
  {children}{box&&<div className="photo-selection-rectangle" aria-hidden="true" style={box}/>}
 </div>;
}

export function PhotoPaneSplitter({width,onChange}:{width:number;onChange:(width:number)=>void}){
 const start=useRef<{x:number;width:number;total:number}|null>(null);
 const clamp=(next:number)=>Math.min(65,Math.max(22,next));
 return <div className="photo-pane-splitter" role="separator" aria-label="사진 영역 너비 조절" aria-orientation="vertical" aria-valuemin={22} aria-valuemax={65} aria-valuenow={Math.round(width)} tabIndex={0}
  onPointerDown={e=>{start.current={x:e.clientX,width,total:e.currentTarget.parentElement!.getBoundingClientRect().width};e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();}}
  onPointerMove={e=>{if(start.current?.total)onChange(clamp(start.current.width+(start.current.x-e.clientX)/start.current.total*100));}}
  onPointerUp={e=>{start.current=null;if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onPointerCancel={()=>{start.current=null;}}
  onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onChange(clamp(width+(e.key==='ArrowLeft'?2:-2)));}}}
  title="좌우로 드래그하여 사진 영역 크기 조절"><span>⋮</span></div>;
}
export const photoPaneStyle=(width:number)=>({'--library-width':`${width}%`} as CSSProperties);
