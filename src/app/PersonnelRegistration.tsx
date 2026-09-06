import {useEffect,useRef,useState} from 'react';
import {DIVER_QUALIFICATIONS,type DiverQualification} from './diverQualifications';
import {mergePersonnelLibrary,registerPerson,validatePersonnelLibrary} from './personnelLibrary';
import {getDraft,saveDraft} from '../persistence/draftStore';
import {Modal} from './Modal';

export function usePersonnelLibrary(backup: DiverQualification[]|undefined,onSnapshot:(people:DiverQualification[])=>void) {
  const [people,setPeople]=useState<DiverQualification[]>([]);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const revision=useRef(0);
  const snapshot=useRef(onSnapshot);
  const backupKey=JSON.stringify(backup??[]);
  useEffect(()=>{snapshot.current=onSnapshot;});
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const stored=await getDraft('personnel-library','layouts');
      const storedPeople=stored?validatePersonnelLibrary(stored.value):[];
      const merged=mergePersonnelLibrary(storedPeople,JSON.parse(backupKey));
      if(!active)return;
      revision.current=stored?.revision??0;
      if(JSON.stringify(merged)!==JSON.stringify(storedPeople)) {
        const saved=await saveDraft('personnel-library',revision.current,'사용자 등록 인력',merged,'layouts');
        if(!active)return;
        revision.current=saved.revision;
      }
      setPeople(merged);setReady(true);setError('');
      if(JSON.stringify(merged)!==backupKey)snapshot.current(merged);
    };
    void load().catch(reason=>{if(active){setError((reason as Error).message);setReady(false);}});
    return()=>{active=false;};
  },[backupKey]);
  const add=async(input:DiverQualification)=>{
    if(!ready)throw new Error('인력 DB를 읽지 못했습니다. 페이지를 다시 열거나 작업 파일을 백업하세요.');
    const person=registerPerson([...DIVER_QUALIFICATIONS,...people],input,crypto.randomUUID());
    const next=[...people,person];
    const stored=await saveDraft('personnel-library',revision.current,'사용자 등록 인력',next,'layouts');
    revision.current=stored.revision;setPeople(next);snapshot.current(next);return person;
  };
  return {people,ready,error,add};
}

export function PersonnelRegistration({name,onClose,onSave}:{name:string;onClose:()=>void;onSave:(person:DiverQualification)=>Promise<void>}) {
  const [draft,setDraft]=useState<DiverQualification>({koreanName:/[가-힣]/.test(name)?name:'',englishName:/[가-힣]/.test(name)?'':name,birth:'',role:'DIVER',qualification:'',certificateNo:'',issuingBody:''});
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const save=async()=>{setBusy(true);try{await onSave(draft);onClose();}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}};
  return <Modal label="새 인원 등록" onClose={busy?undefined:onClose}><div className="personnel-registration"><h3>새 인원 등록</h3><p>이 브라우저의 인력 DB에 저장합니다. 없는 자격정보는 비워 두세요.</p>
    <div className="report-information-grid">{(['koreanName','englishName','qualification','certificateNo','issuingBody'] as const).map(key=><label className="field" key={key}><span>{({koreanName:'한글명',englishName:'영문명',qualification:'자격명',certificateNo:'자격증 번호',issuingBody:'발급 기관'})[key]}</span><input value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}/></label>)}
    <label className="field"><span>역할</span><select value={draft.role} onChange={event=>setDraft({...draft,role:event.target.value})}><option>SITE SUPERVISOR</option><option>DIVER</option><option>OTHER</option></select></label></div>
    {error&&<p role="alert">{error}</p>}<div className="editor-dialog-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>DB 저장 후 보고서에 추가</button><button type="button" className="ghost" disabled={busy} onClick={onClose}>취소</button></div>
  </div></Modal>;
}
