import { useReducer } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ConditionMatrix } from './ConditionMatrix';
import { ConditionEditor } from './ConditionEditor';
import { initialReportState, reportReducer } from './reportState';
import { createGeneralSections, createNicheSections } from '../domain/structure';
import {readFileSync} from 'node:fs';
const matrixCss=readFileSync('src/app/ConditionMatrix.css','utf8');

function Harness() {
  const [report,dispatch]=useReducer(reportReducer,reportReducer(initialReportState,{type:'SET_SCOPE',sections:[
    ...createGeneralSections('CLEANING'),...createNicheSections({component:'Sea Chest',type:'SIDE',quantity:1,service:'REMOVAL'}),
  ]}));
  return <><ConditionMatrix report={report} dispatch={dispatch}/><ConditionEditor ariaPrefix="섹션" condition={report.sections[0].conditions.BEFORE!}
    onPatch={patch=>dispatch({type:'UPDATE_CONDITION',sectionId:report.sections[0].id,phase:'BEFORE',patch})}/></>;
}
it('uses one shared heading and compact fields instead of repeated condition cards',()=>{
 render(<><style>{matrixCss}</style><Harness/></>);
 const row=screen.getByRole('group',{name:'CLEANING/GENERAL/FWD/PORT BEFORE 컨디션'});
 expect(getComputedStyle(within(row).getByText('FOULING CONDITION')).display).toBe('none');
 expect(getComputedStyle(within(row).getByLabelText(/fouling rating/)).height).toBe('34px');
 expect(screen.getByLabelText('매트릭스 열 제목')).toBeVisible();
});
it('shares matrix row changes with the section and section changes with the matrix',()=>{
  render(<Harness/>);
  const row=screen.getByRole('group',{name:'CLEANING/GENERAL/FWD/PORT BEFORE 컨디션'});
  fireEvent.change(within(row).getByLabelText(/fouling coverage/),{target:{value:'10'}});
  expect(screen.getByLabelText('섹션 fouling coverage')).toHaveValue(10);
  fireEvent.change(screen.getByLabelText('섹션 fouling coverage'),{target:{value:'30'}});
  expect(within(row).getByLabelText(/fouling coverage/)).toHaveValue(30);
  expect(within(row).getByText('개별 수정 보호')).toBeVisible();
});
it('batches checked rows, protects individual edits and keeps AFTER separate',()=>{
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText('섹션 fouling coverage'),{target:{value:'30'}});
  fireEvent.click(screen.getByLabelText('현재 목록 전체 선택'));
  fireEvent.click(screen.getByRole('button',{name:'선택 구역 일괄 입력'}));
  const dialog=screen.getByRole('dialog',{name:'선택 구역 컨디션 일괄 입력'});
  fireEvent.change(within(dialog).getByLabelText(/fouling coverage/),{target:{value:'10'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'선택 구역에 적용'}));
  expect(screen.getByLabelText('섹션 fouling coverage')).toHaveValue(30);
  const row=screen.getByRole('group',{name:'CLEANING/GENERAL/FWD/STBD BEFORE 컨디션'});
  expect(within(row).getByLabelText(/fouling coverage/)).toHaveValue(10);
  fireEvent.change(screen.getByLabelText('매트릭스 단계'),{target:{value:'AFTER'}});
  expect(within(screen.getByRole('group',{name:'CLEANING/GENERAL/FWD/STBD AFTER 컨디션'})).getByLabelText(/fouling coverage/)).toHaveValue(0);
  expect(screen.getByLabelText('현재 목록 전체 선택')).not.toBeChecked();
});
it('cancel leaves values untouched and changing work filters never shows other work rows',()=>{
  render(<Harness/>);
  fireEvent.click(screen.getByLabelText('현재 목록 전체 선택'));
  fireEvent.click(screen.getByRole('button',{name:'선택 구역 일괄 입력'}));
  const dialog=screen.getByRole('dialog',{name:'선택 구역 컨디션 일괄 입력'});
  fireEvent.change(within(dialog).getByLabelText(/fouling coverage/),{target:{value:'25'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'취소'}));
  expect(screen.getByLabelText('섹션 fouling coverage')).toHaveValue(null);
  fireEvent.change(screen.getByLabelText('매트릭스 작업·영역'),{target:{value:'REMOVAL|NICHE'}});
  expect(screen.queryByRole('group',{name:'CLEANING/GENERAL/FWD/PORT BEFORE 컨디션'})).not.toBeInTheDocument();
  expect(screen.getAllByRole('group',{name:/REMOVAL.*컨디션/})).toHaveLength(2);
});

it('requires opt-in to overwrite individual edits and keeps them protected on the next batch',()=>{
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText('섹션 fouling coverage'),{target:{value:'30'}});
  fireEvent.click(screen.getByLabelText('현재 목록 전체 선택'));
  fireEvent.click(screen.getByRole('button',{name:'선택 구역 일괄 입력'}));
  const dialog=screen.getByRole('dialog',{name:'선택 구역 컨디션 일괄 입력'});
  expect(within(dialog).getByLabelText(/개별 수정값도 덮어쓰기/)).not.toBeChecked();
  fireEvent.change(within(dialog).getByLabelText(/fouling coverage/),{target:{value:'10'}});
  fireEvent.click(within(dialog).getByLabelText(/개별 수정값도 덮어쓰기/));
  fireEvent.click(within(dialog).getByRole('button',{name:'선택 구역에 적용'}));
  expect(screen.getByLabelText('섹션 fouling coverage')).toHaveValue(10);
  fireEvent.click(screen.getByRole('button',{name:'선택 구역 일괄 입력'}));
  const next=screen.getByRole('dialog',{name:'선택 구역 컨디션 일괄 입력'});
  expect(within(next).getByLabelText(/개별 수정값도 덮어쓰기/)).not.toBeChecked();
  fireEvent.change(within(next).getByLabelText(/fouling coverage/),{target:{value:'20'}});
  fireEvent.click(within(next).getByRole('button',{name:'선택 구역에 적용'}));
  expect(screen.getByLabelText('섹션 fouling coverage')).toHaveValue(10);
});
