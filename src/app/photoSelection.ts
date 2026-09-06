export function selectPhotoIds(selected:string[],id:string,visible:string[],anchor:string|null,modifiers:{ctrl?:boolean;shift?:boolean}) {
  if(modifiers.shift && anchor && visible.includes(anchor)) {
    const a=visible.indexOf(anchor),b=visible.indexOf(id);return [...new Set([...selected,...visible.slice(Math.min(a,b),Math.max(a,b)+1)])];
  }
  if(modifiers.ctrl)return selected.includes(id)?selected.filter((value)=>value!==id):[...selected,id];
  return [id];
}
