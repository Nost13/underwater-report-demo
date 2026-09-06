import {useState} from 'react';
import type {VesselSchedule} from './scheduleLookup';
import {formatBerthingSide} from './berthingSide';
const time=(value:string)=>value.replace('T',' ');
const location=(value:VesselSchedule)=>[value.port,value.terminal,value.berth].filter(Boolean).join(' / ');
export function ScheduleChooser({schedules,selected,onApply}:{schedules:VesselSchedule[];selected:VesselSchedule|null;onApply:(value:VesselSchedule)=>void}) {
  const [date,setDate]=useState('');
  const [choice,setChoice]=useState('');
  const candidate=choice!==''?schedules[Number(choice)]:undefined;
  return <section className="vessel-schedule" aria-label="ChainPortal 운항 일정">
    <header><div><span>CHAINPORTAL SCHEDULE</span><strong>{selected?'적용한 일정':'일정 선택 필요'}</strong></div><em>직접 입력 가능</em></header>
    <label className="field"><span>작업 예정일</span><input type="date" aria-label="일정 비교 작업일" value={date} onChange={event=>setDate(event.target.value)}/></label>
    {schedules.length>0?<div className="schedule-choice"><label className="field"><span>적용할 일정</span><select aria-label="ChainPortal 일정 선택" value={choice} onChange={event=>setChoice(event.target.value)}><option value="">일정을 선택하세요</option>{schedules.map((item,index)=><option key={`${item.eta}-${item.etd}-${item.berth}-${index}`} value={String(index)}>{date&&item.eta.slice(0,10)<=date&&item.etd.slice(0,10)>=date?'작업일 포함 · ':''}{time(item.eta)} → {time(item.etd)} · {location(item)}</option>)}</select></label><button type="button" className="primary" disabled={!candidate} onClick={()=>candidate&&onApply(candidate)}>선택 일정 적용</button></div>:<p>예정 일정이 없습니다. 운영 정보에 직접 입력하세요.</p>}
    {selected&&<dl><div><dt>ETA</dt><dd>{time(selected.eta)}</dd></div><div><dt>ETD</dt><dd>{time(selected.etd)}</dd></div><div><dt>LOCATION</dt><dd>{location(selected)}</dd></div><div><dt>BERTHING SIDE</dt><dd>{formatBerthingSide(selected.direction)||'—'}</dd></div></dl>}
  </section>;
}
