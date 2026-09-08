import {useReducer,useState} from 'react';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {expect,it,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {PhotoWorkspace} from './PhotoWorkspace';
import {initialReportState,reportReducer} from './reportState';
import {createGeneralSections} from '../domain/structure';
import type {Phase} from '../domain/types';
afterEach(()=>vi.restoreAllMocks());
it('resizes the photo panes with keyboard and removes fixed column controls',()=>{
 render(<Harness/>);
 const splitter=screen.getByRole('separator',{name:'사진 영역 너비 조절'});
 const before=Number(splitter.getAttribute('aria-valuenow'));
 fireEvent.keyDown(splitter,{key:'ArrowLeft'});
 expect(Number(splitter.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
 expect(screen.queryByLabelText('미배정 사진 배열')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('사진 크기')).not.toBeInTheDocument();
});
it('selects gallery cards using click and Ctrl without losing checkbox support',()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByRole('button',{name:'one.jpg 사진 편집'}));
 fireEvent.click(screen.getByRole('button',{name:'two.jpg 사진 편집'}),{ctrlKey:true});
 expect(screen.getByLabelText('one.jpg 사진 선택')).toBeChecked();
 expect(screen.getByLabelText('two.jpg 사진 선택')).toBeChecked();
});
it('assigns library photos by dragging them into the active gallery',()=>{
 render(<Harness/>);
 const libraryCard=screen.getByLabelText('three.jpg 미배정 선택').closest('article')!;
 fireEvent.dragStart(libraryCard);
 fireEvent.dragOver(screen.getByLabelText('BEFORE 사진 갤러리'));
 fireEvent.drop(screen.getByLabelText('BEFORE 사진 갤러리'));
 expect(screen.queryByLabelText('three.jpg 미배정 선택')).not.toBeInTheDocument();
 expect(screen.getByLabelText('three.jpg 사진 선택')).toBeVisible();
});
it('selects photos inside a dragged rectangle, not those outside it',()=>{
 vi.stubGlobal('PointerEvent',MouseEvent);
 render(<Harness/>);
 const grid=screen.getByLabelText('현재 단계 사진 목록');
 vi.spyOn(grid,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:400,bottom:200,width:400,height:200,x:0,y:0,toJSON(){}} as DOMRect);
 for(const [index,card] of within(grid).getAllByRole('article').entries()){
  vi.spyOn(card,'getBoundingClientRect').mockReturnValue({left:10+index*180,top:10,right:170+index*180,bottom:160,width:160,height:150,x:0,y:0,toJSON(){}} as DOMRect);
 }
 fireEvent.pointerDown(grid,{clientX:1,clientY:1,button:0});
 fireEvent.pointerMove(grid,{clientX:175,clientY:170,button:0});
 fireEvent.pointerUp(grid,{clientX:175,clientY:170,button:0});
 expect(screen.getByLabelText('one.jpg 사진 선택')).toBeChecked();
 expect(screen.getByLabelText('two.jpg 사진 선택')).not.toBeChecked();
 vi.unstubAllGlobals();
});

function Harness({inspection=false}:{inspection?:boolean}){
 const [report,dispatch]=useReducer(reportReducer,undefined,()=>{
  const base=reportReducer(initialReportState,{type:'SET_SCOPE',sections:createGeneralSections(inspection?'INSPECTION':'CLEANING').slice(0,2)});
  return {...base,photos:['one','two','three'].map((id,index)=>({id,file:new File([id],id+'.jpg',{type:'image/jpeg'}),relativePath:id+'.jpg',sectionId:index===2?null:base.sections[0].id,phase:index===2?null:base.sections[0].phases[0],order:index,reportUse:true,captionText:''}))};
 });
 const [phase,setPhase]=useState<Phase>(inspection?'CURRENT':'BEFORE');
 return <><PhotoWorkspace report={report} section={report.sections[0]} phase={phase} dispatch={dispatch} onPhase={setPhase} onSection={()=>{}} onAddPhotos={()=>{}} onOpenLibrary={()=>{}} renderThumb={(photo)=><span role="img" aria-label={photo.file.name}/>} /><output aria-label="saved">{JSON.stringify(report)}</output></>;
}
it('switches phase without losing editable work labels and shows only that phase',()=>{
 render(<Harness/>);
 fireEvent.change(screen.getByLabelText('BEFORE 작업명'),{target:{value:'CUSTOM HULL'}});
 fireEvent.change(screen.getByLabelText('BEFORE 단계 문구'),{target:{value:'Prior to work'}});
 fireEvent.click(screen.getByRole('tab',{name:/작업 후/}));
 expect(screen.queryByLabelText('BEFORE 작업명')).not.toBeInTheDocument();
 expect(screen.getByLabelText('AFTER 작업명')).toBeVisible();
 fireEvent.click(screen.getByRole('tab',{name:/작업 전/}));
 expect(screen.getByLabelText('BEFORE 작업명')).toHaveValue('CUSTOM HULL');
 expect(screen.getByLabelText('BEFORE 단계 문구')).toHaveValue('Prior to work');
});
it('edits real conditions and displays derived ratings, slime, and observed status separately',()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByText('컨디션 수정'));
 fireEvent.change(screen.getByLabelText('BEFORE fouling coverage'),{target:{value:'3'}});
 fireEvent.click(screen.getByLabelText('BEFORE Slime Only'));
 fireEvent.change(screen.getByLabelText('BEFORE observed level'),{target:{value:'Significant Observation'}});
 expect(screen.getByLabelText('컨디션 요약')).toHaveTextContent('R1');
 expect(screen.getByLabelText('컨디션 요약')).toHaveTextContent('3%');
 expect(screen.getByLabelText('컨디션 요약')).toHaveTextContent('Slime Only');
 expect(screen.getByLabelText('컨디션 요약')).toHaveTextContent('R4');
 expect(screen.getByLabelText('saved')).toHaveTextContent('OVERRIDE');
});
it('uses current only for inspection',()=>{
 render(<Harness inspection/>);
 expect(screen.getByRole('tab',{name:/현재 CURRENT/})).toBeVisible();
 expect(screen.queryByRole('tab',{name:/작업 후/})).not.toBeInTheDocument();
});
it('bulk assigns library selections to the active phase with automatic columns',()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByRole('tab',{name:/작업 후/}));
 fireEvent.click(screen.getByLabelText('three.jpg 미배정 선택'));
 fireEvent.click(screen.getByRole('button',{name:'선택한 1장 배정'}));
 expect(within(screen.getByLabelText('AFTER 사진 갤러리')).getByText('three.jpg')).toBeVisible();
 expect(screen.queryByLabelText('미배정 사진 배열')).not.toBeInTheDocument();
});
it('opens sidebar editing, saves captions, excludes and unassigns without deleting photos',()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByRole('button',{name:'one.jpg 사진 편집'}));
 fireEvent.change(screen.getByLabelText('one.jpg 추가 캡션'),{target:{value:'Valve inspected'}});
 fireEvent.click(screen.getByLabelText('one.jpg Report Use'));
 expect(screen.getByLabelText('saved')).toHaveTextContent('Valve inspected');
 fireEvent.click(screen.getByRole('button',{name:'one.jpg 미배정으로 이동'}));
 fireEvent.click(screen.getByRole('tab',{name:/미배정 사진/}));
 expect(screen.getByLabelText('one.jpg 미배정 선택')).toBeVisible();
 expect(screen.getByLabelText('saved')).toHaveTextContent('Valve inspected');
});
it('moves a selected batch to the other phase',()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByLabelText('현재 단계 사진 전체 선택'));
 fireEvent.click(screen.getByRole('button',{name:'선택 사진 이동'}));
 fireEvent.change(screen.getByLabelText('선택 사진 이동 단계'),{target:{value:'AFTER'}});
 fireEvent.click(screen.getByRole('button',{name:'이동 완료'}));
 fireEvent.click(screen.getByRole('tab',{name:/작업 후/}));
 expect(within(screen.getByLabelText('AFTER 사진 갤러리')).getAllByRole('article')).toHaveLength(2);
});
it('keeps the matrix wrapper content-sized instead of reserving a full viewport',()=>{
 render(<><style>{readFileSync('src/app/ConditionMatrix.css','utf8')}</style><div className="workspace wide matrix-preparation" aria-label="preparation"/></>);
 expect(getComputedStyle(screen.getByLabelText('preparation')).minHeight).toBe('0px');
});
it.each(['insert','end'])('drags a selected block in gallery order using %s drop',mode=>{
 render(<Harness/>);
 fireEvent.click(screen.getByLabelText('three.jpg 미배정 선택'));
 fireEvent.click(screen.getByRole('button',{name:'선택한 1장 배정'}));
 fireEvent.click(screen.getByLabelText('two.jpg 사진 선택'));
 fireEvent.click(screen.getByLabelText('one.jpg 사진 선택'));
 fireEvent.dragStart(screen.getByRole('article',{name:'one.jpg 사진'}));
 const target=mode==='insert'?screen.getByRole('article',{name:'three.jpg 사진'}):screen.getByRole('button',{name:'BEFORE 사진 맨 뒤로 이동'});
 fireEvent.dragOver(target);fireEvent.drop(target);
 const cards=within(screen.getByLabelText('BEFORE 사진 갤러리')).getAllByRole('article').map(card=>card.getAttribute('aria-label'));
 expect(cards).toEqual(mode==='insert'?['one.jpg 사진','two.jpg 사진','three.jpg 사진']:['three.jpg 사진','one.jpg 사진','two.jpg 사진']);
});
it('moves a batch in source order even when selected backwards',()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByLabelText('two.jpg 사진 선택'));
 fireEvent.click(screen.getByLabelText('one.jpg 사진 선택'));
 fireEvent.click(screen.getByRole('button',{name:'선택 사진 이동'}));
 fireEvent.change(screen.getByLabelText('선택 사진 이동 단계'),{target:{value:'AFTER'}});
 fireEvent.click(screen.getByRole('button',{name:'이동 완료'}));
 fireEvent.click(screen.getByRole('tab',{name:/작업 후/}));
 expect(within(screen.getByLabelText('AFTER 사진 갤러리')).getAllByRole('article').map(card=>card.getAttribute('aria-label'))).toEqual(['one.jpg 사진','two.jpg 사진']);
});
it('zooms the original File instead of reusing the gallery thumbnail',()=>{
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:original-photo');
 const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 render(<Harness/>);
 fireEvent.click(screen.getByRole('button',{name:'one.jpg 확대'}));
 const dialog=screen.getByRole('dialog',{name:'사진 확대'});
 expect(within(dialog).getByRole('img',{name:'one.jpg'})).toHaveAttribute('src','blob:original-photo');
 expect(create.mock.calls[0][0]).toMatchObject({name:'one.jpg',size:3});
 fireEvent.click(within(dialog).getByRole('button',{name:'닫기'}));
 expect(revoke).toHaveBeenCalledWith('blob:original-photo');
});
