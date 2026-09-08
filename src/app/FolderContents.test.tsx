import {fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import userEvent from '@testing-library/user-event';
import {expect,it} from 'vitest';
import {FolderContents} from './FolderContents';
import type {DirectoryHandleLike} from '../browser/directory';
it('keeps the folder dialog outside the app grid and closes on Escape without removing the workspace',async()=>{
 const root={kind:'directory',name:'QA',async *entries(){}} as unknown as DirectoryHandleLike;
 function Host(){const [open,setOpen]=useState(true);return <main className="app-shell"><nav>Steps</nav><article>Report</article>{open&&<FolderContents root={root} onClose={()=>setOpen(false)}/>}</main>;}
 const {container}=render(<Host/>);
 const dialog=screen.getByRole('dialog',{name:'생성한 폴더 확인'});
 expect(container.querySelector('.app-shell')?.children).toHaveLength(2);
 expect(dialog.parentElement).toBe(document.body);
 fireEvent(dialog,new Event('cancel',{bubbles:true,cancelable:true}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(screen.getByText('Report')).toBeVisible();
});
it('opens a created subfolder and returns to its parent',async()=>{
 const child={kind:'directory',name:'BEFORE',async *entries(){yield ['qa.jpg',{kind:'file',name:'qa.jpg'}];}} as unknown as DirectoryHandleLike;
 const root={kind:'directory',name:'QA',async *entries(){yield ['BEFORE',child];}} as unknown as DirectoryHandleLike;
 const user=userEvent.setup();render(<FolderContents root={root} onClose={()=>{}}/>);
 await user.click(await screen.findByRole('button',{name:'BEFORE 폴더 열기'}));
 expect(await screen.findByText('qa.jpg')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'상위 폴더'}));expect(await screen.findByRole('button',{name:'BEFORE 폴더 열기'})).toBeVisible();
});
