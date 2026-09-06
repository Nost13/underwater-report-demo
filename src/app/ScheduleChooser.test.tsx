import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {expect,it} from 'vitest';
import type {VesselSchedule} from './scheduleLookup';
import {ScheduleChooser} from './ScheduleChooser';
const calls:VesselSchedule[]=[{vessel:'QA',port:'Busan',terminal:'QA',berth:'1',carrier:'',direction:'S',eta:'2026-09-01T01:00',etd:'2026-09-02T01:00'},{vessel:'QA',port:'Busan',terminal:'QA',berth:'2',carrier:'',direction:'P',eta:'2026-10-01T01:00',etd:'2026-10-02T01:00'}];
function Harness(){const [selected,setSelected]=useState<VesselSchedule|null>(null);return <><ScheduleChooser schedules={calls} selected={selected} onApply={setSelected}/><output aria-label="applied">{selected?.berth??'none'}</output></>;}
it('uses one selection surface and applies only the explicitly selected call',async()=>{
 const user=userEvent.setup();render(<Harness/>);
 expect(screen.getAllByRole('combobox')).toHaveLength(1);
 await user.selectOptions(screen.getByRole('combobox'),'1');
 expect(screen.getByLabelText('applied')).toHaveTextContent('none');
 await user.click(screen.getByRole('button',{name:'선택 일정 적용'}));
 expect(screen.getByLabelText('applied')).toHaveTextContent('2');
 expect(screen.getAllByRole('combobox')).toHaveLength(1);
});
