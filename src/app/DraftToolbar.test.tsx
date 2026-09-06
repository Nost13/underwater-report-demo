import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useState} from 'react';
import {DraftToolbar} from './DraftToolbar';
const mocks=vi.hoisted(()=>({list:vi.fn(),get:vi.fn(),save:vi.fn()}));
vi.mock('../persistence/draftStore',()=>({listDrafts:mocks.list,getDraft:mocks.get,saveDraft:mocks.save}));
function Harness(){const[value,setValue]=useState({text:'initial'});return <><output>{value.text}</output><DraftToolbar snapshot={{...value}} title="TEST" hasWork onRestore={(raw)=>setValue(raw as typeof value)} onNew={()=>setValue({text:'new'})}/></>;}
beforeEach(()=>{mocks.list.mockResolvedValue([{id:'job',title:'saved',revision:2,updatedAt:100}]);mocks.get.mockResolvedValue({id:'job',revision:2,updatedAt:100,value:{text:'saved'},previous:{text:'previous'}});mocks.save.mockResolvedValue({revision:3,updatedAt:200});vi.spyOn(window,'confirm').mockReturnValue(true);});
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});
it('opening an existing job does not resave identical data and destroy its previous version',async()=>{
 render(<Harness/>);fireEvent.click(await screen.findByRole('button',{name:'이어서 작성'}));await screen.findByText('saved',{selector:'output'});
 await act(()=>new Promise((resolve)=>setTimeout(resolve,1100)));
 expect(mocks.save).not.toHaveBeenCalled();
});
it('restoring the previous version intentionally writes a new revision',async()=>{
 render(<Harness/>);fireEvent.click(await screen.findByRole('button',{name:'직전 저장본 복원'}));await screen.findByText('previous',{selector:'output'});
 await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith('job',2,'TEST',{text:'previous'}),{timeout:2000});
});
