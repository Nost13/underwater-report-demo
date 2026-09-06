import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it} from 'vitest';
import {FolderContents} from './FolderContents';
import type {DirectoryHandleLike} from '../browser/directory';
it('opens a created subfolder and returns to its parent',async()=>{
 const child={kind:'directory',name:'BEFORE',async *entries(){yield ['qa.jpg',{kind:'file',name:'qa.jpg'}];}} as unknown as DirectoryHandleLike;
 const root={kind:'directory',name:'QA',async *entries(){yield ['BEFORE',child];}} as unknown as DirectoryHandleLike;
 const user=userEvent.setup();render(<FolderContents root={root} onClose={()=>{}}/>);
 await user.click(await screen.findByRole('button',{name:'BEFORE 폴더 열기'}));
 expect(await screen.findByText('qa.jpg')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'상위 폴더'}));expect(await screen.findByRole('button',{name:'BEFORE 폴더 열기'})).toBeVisible();
});
