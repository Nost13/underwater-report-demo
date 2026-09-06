import { createContext, useContext, useRef, useState, type MutableRefObject } from 'react';
import { Modal } from './Modal';
interface Pending { apply():void; discard():void }
const empty={current:null} as MutableRefObject<Pending|null>;
export const PendingEditsContext=createContext<{entry:MutableRefObject<Pending|null>;confirm:()=>Promise<boolean>}>({entry:empty,confirm:async()=>true});
export const usePendingContext=()=>useContext(PendingEditsContext);
export function usePendingEdits() {
  const entry=useRef<Pending|null>(null);
  const resolver=useRef<((ok:boolean)=>void)|null>(null);
  const [open,setOpen]=useState(false);
  const confirm=()=>!entry.current?Promise.resolve(true):new Promise<boolean>((resolve)=>{resolver.current?.(false);resolver.current=resolve;setOpen(true);});
  const close=(choice:'APPLY'|'DISCARD'|'STAY')=>{if(choice==='APPLY')entry.current?.apply();if(choice==='DISCARD')entry.current?.discard();resolver.current?.(choice!=='STAY');resolver.current=null;setOpen(false);};
  return {entry,confirm,dialog:open?<Modal label="적용하지 않은 구역 기본값" onClose={()=>close('STAY')}><h3>구역 기본값 변경이 아직 적용되지 않았습니다.</h3><p>변경한 값을 적용할지 선택하세요. 개별 수정한 구역은 유지됩니다.</p><button type="button" onClick={()=>close('APPLY')}>적용하고 이동</button><button type="button" onClick={()=>close('DISCARD')}>변경 취소하고 이동</button><button type="button" onClick={()=>close('STAY')}>계속 편집</button></Modal>:null};
}
