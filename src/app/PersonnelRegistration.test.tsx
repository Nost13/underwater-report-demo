import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {expect,it,vi} from 'vitest';
import {ReportInformation} from './ReportInformation';
import {emptyReportInfo} from './reportInfo';
import type {DraftRecord} from '../persistence/draftStore';
const storage=vi.hoisted(()=>({record:undefined as DraftRecord|undefined}));
vi.mock('../persistence/draftStore',()=>({
 getDraft:async()=>storage.record,
 saveDraft:async(id:string,expected:number,title:string,value:unknown)=> {
  if((storage.record?.revision??0)!==expected)throw new Error('충돌');
  storage.record={id,revision:expected+1,title,value,updatedAt:1};return storage.record;
 }
}));
function Harness(){const [value,onChange]=useState(emptyReportInfo);return <ReportInformation value={value} onChange={onChange} onBack={()=>{}} onNext={()=>{}}/>;}
it('registers an unknown person, adds to this job and finds them in the next job',async()=>{
 storage.record=undefined;
 const user=userEvent.setup();const first=render(<Harness/>);
 await user.type(screen.getByLabelText('Diver search'),'QA New Person');
 await user.click(await screen.findByRole('button',{name:'새 인원 등록'}));
 await user.click(screen.getByRole('button',{name:'DB 저장 후 보고서에 추가'}));
 await waitFor(()=>expect(screen.getByRole('table',{name:'선택한 자격 인원'})).toHaveTextContent('QA New Person'));
 first.unmount();render(<Harness/>);
 await user.type(screen.getByLabelText('Diver search'),'QA New Person');
 await user.click(await screen.findByRole('button',{name:'QA New Person 선택'}));
 expect(screen.getByRole('table',{name:'선택한 자격 인원'})).toHaveTextContent('QA New Person');
});
