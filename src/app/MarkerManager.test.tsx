import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {expect,it} from 'vitest';
import {MarkerManager} from './MarkerManager';
import {DEFAULT_CALIBRATION,type VesselDiagramConfig} from '../vesselDiagram/types';
import {createDefaultHullMarkers,createDefaultNicheMarkers} from '../vesselDiagram/geometry';
import {resolveMarkerIds} from '../vesselDiagram/markers';
import type {ReportSection} from '../domain/types';
const section={id:'SEA CHEST',component:'SEA CHEST',area:'NICHE',service:'REMOVAL'} as ReportSection;
function Harness(){const [value,onChange]=useState<VesselDiagramConfig>({imageFile:new File(['a'],'test.png'),imageName:'test.png',confirmed:true,calibration:{...DEFAULT_CALIBRATION},hullMarkers:createDefaultHullMarkers(DEFAULT_CALIBRATION),nicheMarkers:createDefaultNicheMarkers(DEFAULT_CALIBRATION,1)});return <><MarkerManager value={value} sections={[section]} onChange={onChange} nameMarker={m=>m.label??m.id}/><output aria-label="bindings">{resolveMarkerIds(section,value).join(',')}</output><output aria-label="confirmed">{String(value.confirmed)}</output></>;}
it('adds a named marker to an explicit Scope and supports removal and undo without resetting other links',async()=>{
 const user=userEvent.setup();render(<Harness/>);
 await user.click(screen.getByRole('button',{name:'표식 추가'}));
 const dialog=screen.getByRole('dialog',{name:'표식 추가·수정'});
 await user.clear(within(dialog).getByLabelText('표식 이름'));await user.type(within(dialog).getByLabelText('표식 이름'),'QA Chest');
 await user.click(within(dialog).getByRole('checkbox',{name:'SEA CHEST 연결'}));
 await user.click(within(dialog).getByRole('button',{name:'표식 저장'}));
 expect(screen.getByLabelText('bindings')).toHaveTextContent('aft-services,custom-');expect(screen.getByLabelText('confirmed')).toHaveTextContent('false');
 await user.click(screen.getByText(/전체 표식 편집/));
 await user.click(screen.getByRole('button',{name:'QA Chest 수정'}));
 await user.click(screen.getByRole('button',{name:'표식 삭제'}));
 expect(screen.getByLabelText('bindings')).toHaveTextContent(/^aft-services$/);
 await user.click(screen.getByRole('button',{name:'표식 변경 실행 취소'}));
 expect(screen.getByRole('button',{name:'QA Chest 수정'})).toBeVisible();
});
