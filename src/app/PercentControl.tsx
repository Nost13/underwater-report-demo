import {useState} from 'react';
export function PercentControl({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void}) {
  const [draft,setDraft]=useState<string|null>(null);const [error,setError]=useState('');
  const commit=()=>{
    if(draft===null)return;
    const parsed=Number(draft)/100;
    if(!draft.trim()||!Number.isFinite(parsed)||parsed<min||parsed>max)setError(`${min*100}%~${max*100}% 범위로 입력하세요.`);
    else {onChange(parsed);setError('');}
    setDraft(null);
  };
  return <div className="percent-control"><label><span>{label}</span><input type="range" aria-label={label} min={min} max={max} step="0.002" value={value} onChange={event=>{setDraft(null);setError('');onChange(Number(event.target.value));}}/></label><div><input type="number" step="0.1" min={min*100} max={max*100} aria-label={`${label} 숫자`} value={draft??Number((value*100).toFixed(2))} onChange={event=>setDraft(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit();}if(event.key==='Escape'){setDraft(null);setError('');}}}/><span>%</span></div>{error&&<small role="alert">{error}</small>}</div>;
}
