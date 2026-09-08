import {render,screen,fireEvent,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {PhotoLibraryPicker} from './PhotoLibraryPicker';
const photos=['a','b','c'].map((id,order)=>({id,file:new File([id],id+'.jpg',{type:'image/jpeg'}),relativePath:id+'.jpg',sectionId:null,phase:null,reportUse:true,order,captionText:''}));
it('uses the same explorer selection in the full library while respecting the selection limit',()=>{
 vi.stubGlobal('URL',{createObjectURL:()=>'',revokeObjectURL:()=>{}});
 const pick=vi.fn();
 render(<PhotoLibraryPicker photos={photos} title="전체 사진" limit={2} onPick={pick} onClose={()=>{}}/>);
 const grid=screen.getByLabelText('전체 사진 목록');
 fireEvent.keyDown(grid,{key:'a',ctrlKey:true});
 expect(within(grid).getAllByRole('checkbox').filter(c=>(c as HTMLInputElement).checked)).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'선택 사진 사용'}));
 expect(pick.mock.calls[0][0].map((p:{id:string})=>p.id)).toEqual(['a','b']);
 vi.unstubAllGlobals();
});
